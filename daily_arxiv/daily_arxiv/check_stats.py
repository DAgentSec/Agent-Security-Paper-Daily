#!/usr/bin/env python3
import json
import sys
import os
from datetime import datetime, timedelta


def load_papers_data(file_path):
    if not os.path.exists(file_path):
        return [], set()
    papers = []
    ids = set()
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)
                    papers.append(data)
                    ids.add(data.get("id", ""))
        return papers, ids
    except Exception as e:
        print(f"Error reading {file_path}: {e}", file=sys.stderr)
        return [], set()


def save_papers_data(papers, file_path):
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            for paper in papers:
                f.write(json.dumps(paper, ensure_ascii=False) + "\n")
        return True
    except Exception as e:
        print(f"Error saving {file_path}: {e}", file=sys.stderr)
        return False


def perform_deduplication():
    today = datetime.now().strftime("%Y-%m-%d")
    today_file = f"../data/{today}.jsonl"
    history_days = 7

    if not os.path.exists(today_file):
        print("Today's data file does not exist", file=sys.stderr)
        return "no_data"

    try:
        today_papers, today_ids = load_papers_data(today_file)
        print(f"Today's total papers: {len(today_papers)}", file=sys.stderr)

        if not today_papers:
            return "no_data"

        history_ids = set()
        for i in range(1, history_days + 1):
            date_str = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            history_file = f"../data/{date_str}.jsonl"
            _, past_ids = load_papers_data(history_file)
            history_ids.update(past_ids)

        print(f"History {history_days} days dedup library size: {len(history_ids)}", file=sys.stderr)

        duplicate_ids = today_ids & history_ids

        if duplicate_ids:
            print(f"Found {len(duplicate_ids)} historical duplicate papers", file=sys.stderr)
            new_papers = [p for p in today_papers if p.get("id", "") not in duplicate_ids]
            print(f"Remaining papers after deduplication: {len(new_papers)}", file=sys.stderr)

            if new_papers:
                if save_papers_data(new_papers, today_file):
                    print(f"Updated today's file, removed {len(duplicate_ids)} duplicates", file=sys.stderr)
                    return "has_new_content"
                else:
                    print("Failed to save deduplicated data", file=sys.stderr)
                    return "error"
            else:
                try:
                    os.remove(today_file)
                    print("All papers are duplicates, today's file deleted", file=sys.stderr)
                except Exception as e:
                    print(f"Failed to delete file: {e}", file=sys.stderr)
                return "no_new_content"
        else:
            print("All content is new", file=sys.stderr)
            return "has_new_content"

    except Exception as e:
        print(f"Deduplication processing failed: {e}", file=sys.stderr)
        return "error"


def main():
    print("Performing deduplication check...", file=sys.stderr)
    status = perform_deduplication()

    if status == "has_new_content":
        print("Deduplication complete, new content found, continuing workflow", file=sys.stderr)
        sys.exit(0)
    elif status == "no_new_content":
        print("Deduplication complete, no new content, stopping workflow", file=sys.stderr)
        sys.exit(1)
    elif status == "no_data":
        print("No data today, stopping workflow", file=sys.stderr)
        sys.exit(1)
    elif status == "error":
        print("Deduplication error, stopping workflow", file=sys.stderr)
        sys.exit(2)
    else:
        print("Unknown deduplication status, stopping workflow", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
