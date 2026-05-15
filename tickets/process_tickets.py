#!/usr/bin/env python3
"""
Process manual conference paper tickets and merge them into the daily data pipeline.

Ticket format (JSON file in tickets/pending/):
{
    "id": "unique-id (e.g. ccs2024-xxx)",
    "title": "Paper Title",
    "authors": ["Author One", "Author Two"],
    "summary": "Abstract text...",
    "pdf": "https://...",
    "abs": "https://...",
    "venue_name": "CCS",
    "venue_year": 2024,
    "catalog": "Agent Sec",
    "categories": []
}

Required fields: pdf or abs, venue_name, venue_year, catalog.
Optional: title, authors, summary (auto-filled if omitted and URL is accessible).
"""

import json
import os
import sys
import argparse
from datetime import datetime
from typing import Optional

import yaml
import requests


TICKETS_DIR = os.path.join(os.path.dirname(__file__), "pending")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "venues.yaml")
VALID_CATALOGS = {"Agent Sec", "Agent for Sec", "Infra", "Frontier Sec", "Model"}


def load_venue_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def normalize_venue(raw_name: str, config: dict) -> Optional[tuple[str, str]]:
    """
    Normalize a raw venue name to (canonical_name, venue_track).
    Returns None if the name cannot be mapped to any known venue.
    """
    normalized = raw_name.strip().lower()
    venues: dict = config.get("venues", {})
    for track, venue_list in venues.items():
        for venue in venue_list:
            if normalized == venue["name"].lower():
                return venue["name"], track
            for alias in venue.get("aliases", []):
                if normalized == alias.lower():
                    return venue["name"], track
    return None


def validate_url(url: str) -> bool:
    try:
        resp = requests.head(url, timeout=10, allow_redirects=True)
        return resp.status_code < 400
    except Exception:
        return False


def validate_ticket(ticket: dict, config: dict) -> list[str]:
    errors = []

    if not ticket.get("pdf") and not ticket.get("abs"):
        errors.append("Missing required field: 'pdf' or 'abs' (at least one required)")

    if not ticket.get("venue_name"):
        errors.append("Missing required field: 'venue_name'")

    if not ticket.get("venue_year"):
        errors.append("Missing required field: 'venue_year'")
    else:
        try:
            year = int(ticket["venue_year"])
            if year < 2000 or year > datetime.now().year + 1:
                errors.append(f"Invalid venue_year: {year}")
        except (ValueError, TypeError):
            errors.append(f"venue_year must be an integer, got: {ticket['venue_year']!r}")

    catalog = ticket.get("catalog")
    if not catalog:
        errors.append("Missing required field: 'catalog'")
    elif catalog not in VALID_CATALOGS:
        errors.append(f"Invalid catalog: {catalog!r}. Must be one of: {sorted(VALID_CATALOGS)}")

    if ticket.get("venue_name") and not errors:
        result = normalize_venue(ticket["venue_name"], config)
        if result is None:
            errors.append(
                f"Venue {ticket['venue_name']!r} not in whitelist. "
                "Update config/venues.yaml or check the spelling."
            )

    return errors


def normalize_ticket(ticket: dict, config: dict) -> dict:
    result = normalize_venue(ticket["venue_name"], config)
    canonical_name, track = result  # type: ignore[misc]

    normalized = dict(ticket)
    normalized["source_type"] = "conference"
    normalized["venue_name"] = canonical_name
    normalized["venue_track"] = track
    normalized["venue_year"] = int(ticket["venue_year"])
    normalized.setdefault("categories", [])
    normalized.setdefault("comment", None)
    normalized.setdefault("authors", [])
    normalized.setdefault("title", "")
    normalized.setdefault("summary", "")
    return normalized


def load_tickets(ticket_files: Optional[list[str]] = None) -> list[dict]:
    if ticket_files:
        paths = ticket_files
    else:
        if not os.path.isdir(TICKETS_DIR):
            return []
        paths = [
            os.path.join(TICKETS_DIR, f)
            for f in os.listdir(TICKETS_DIR)
            if f.endswith(".json") or f.endswith(".jsonl")
        ]

    tickets = []
    for path in paths:
        try:
            with open(path, "r", encoding="utf-8") as f:
                if path.endswith(".jsonl"):
                    for line in f:
                        if line.strip():
                            tickets.append(json.loads(line))
                else:
                    data = json.load(f)
                    if isinstance(data, list):
                        tickets.extend(data)
                    else:
                        tickets.append(data)
        except Exception as e:
            print(f"Error reading {path}: {e}", file=sys.stderr)

    return tickets


def merge_into_daily(tickets: list[dict], output_file: str) -> None:
    existing_ids: set = set()
    existing_papers = []

    if os.path.exists(output_file):
        with open(output_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    paper = json.loads(line)
                    existing_papers.append(paper)
                    existing_ids.add(paper.get("id", ""))

    new_papers = [t for t in tickets if t.get("id", "") not in existing_ids]

    if not new_papers:
        print(f"No new tickets to merge into {output_file}", file=sys.stderr)
        return

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "a", encoding="utf-8") as f:
        for paper in new_papers:
            f.write(json.dumps(paper, ensure_ascii=False) + "\n")

    print(f"Merged {len(new_papers)} ticket(s) into {output_file}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Process manual conference paper tickets")
    parser.add_argument(
        "--output",
        type=str,
        help="Target JSONL file to merge into (default: data/<today>.jsonl)",
    )
    parser.add_argument(
        "--tickets",
        nargs="*",
        help="Specific ticket files to process (default: all in tickets/pending/)",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate tickets without merging",
    )
    parser.add_argument(
        "--check-urls",
        action="store_true",
        help="Validate URL reachability (slower)",
    )
    args = parser.parse_args()

    config = load_venue_config()
    tickets = load_tickets(args.tickets)

    if not tickets:
        print("No tickets found.", file=sys.stderr)
        sys.exit(0)

    print(f"Loaded {len(tickets)} ticket(s)", file=sys.stderr)

    valid_tickets = []
    has_errors = False

    for i, ticket in enumerate(tickets):
        errors = validate_ticket(ticket, config)

        if args.check_urls:
            url = ticket.get("pdf") or ticket.get("abs")
            if url and not validate_url(url):
                errors.append(f"URL not reachable: {url}")

        if errors:
            print(f"Ticket {i} ({ticket.get('id', '<no-id>')}): INVALID", file=sys.stderr)
            for err in errors:
                print(f"  - {err}", file=sys.stderr)
            has_errors = True
        else:
            normalized = normalize_ticket(ticket, config)
            valid_tickets.append(normalized)

    if has_errors:
        print(f"{sum(1 for t in tickets) - len(valid_tickets)} ticket(s) failed validation", file=sys.stderr)

    print(f"{len(valid_tickets)} ticket(s) passed validation", file=sys.stderr)

    if args.validate_only:
        sys.exit(1 if has_errors else 0)

    if not valid_tickets:
        print("No valid tickets to merge.", file=sys.stderr)
        sys.exit(1 if has_errors else 0)

    output_file = args.output
    if not output_file:
        today = datetime.now().strftime("%Y-%m-%d")
        output_file = os.path.join(
            os.path.dirname(__file__), "..", "data", f"{today}.jsonl"
        )
        output_file = os.path.normpath(output_file)

    merge_into_daily(valid_tickets, output_file)
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
