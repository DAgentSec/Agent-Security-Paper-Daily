import json
import argparse
import os
from itertools import count

CATALOG_ORDER = ["Agent Sec", "Agent for Sec", "Infra", "Frontier Sec", "Model"]
CATALOG_FALLBACK = "Frontier Sec"

REQUIRED_AI_FIELDS = ["tldr", "motivation", "method", "result", "conclusion"]


def catalog_rank(catalog: str) -> int:
    try:
        return CATALOG_ORDER.index(catalog)
    except ValueError:
        return len(CATALOG_ORDER)


def source_tag(item: dict) -> str:
    source_type = item.get("source_type", "arxiv")
    if source_type == "conference":
        venue = item.get("venue_name", "")
        year = item.get("venue_year", "")
        track = item.get("venue_track", "")
        parts = [p for p in [venue, str(year) if year else ""] if p]
        label = " ".join(parts)
        if track:
            label += f" [{track}]"
        return label if label else "conference"
    return "arXiv"


def load_data(path: str) -> list[dict]:
    data = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line))
    return data


def assign_catalog(item: dict) -> str:
    catalog = item.get("catalog")
    if catalog and catalog in CATALOG_ORDER:
        return catalog
    return CATALOG_FALLBACK


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=str, required=True, help="Path to the jsonline file")
    args = parser.parse_args()

    data = load_data(args.data)
    template = open("paper_template.md", "r").read()

    catalogs_present = sorted(
        {assign_catalog(item) for item in data},
        key=catalog_rank,
    )

    cnt = {cat: 0 for cat in catalogs_present}
    for item in data:
        cnt[assign_catalog(item)] += 1

    markdown = "<div id=toc></div>\n\n# Table of Contents\n\n"
    for cat in catalogs_present:
        markdown += f"- [{cat}](#{cat.replace(' ', '-')}) [Total: {cnt[cat]}]\n"

    idx_counter = count(1)
    for cat in catalogs_present:
        anchor = cat.replace(" ", "-")
        markdown += f"\n\n<div id='{anchor}'></div>\n\n"
        markdown += f"# {cat} [[Back]](#toc)\n\n"

        papers = []
        for item in data:
            if assign_catalog(item) != cat:
                continue

            ai_data = item.get("AI", {})
            if not ai_data or not isinstance(ai_data, dict):
                print(f"Skipping '{item.get('title', 'Unknown')}': missing AI data")
                continue
            if not all(field in ai_data for field in REQUIRED_AI_FIELDS):
                print(f"Skipping '{item.get('title', 'Unknown')}': incomplete AI fields")
                continue

            url = item.get("abs") or item.get("pdf", "")
            papers.append(
                template.format(
                    idx=next(idx_counter),
                    title=item.get("title", ""),
                    url=url,
                    authors=", ".join(item.get("authors", [])),
                    catalog=cat,
                    source_tag=source_tag(item),
                    summary=item.get("summary", ""),
                    tldr=ai_data.get("tldr", ""),
                    motivation=ai_data.get("motivation", ""),
                    method=ai_data.get("method", ""),
                    result=ai_data.get("result", ""),
                    conclusion=ai_data.get("conclusion", ""),
                )
            )
        markdown += "\n\n".join(papers)

    output_path = args.data.split("_")[0] + ".md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"Written to {output_path}")
