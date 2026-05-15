import os
import re
import yaml
from typing import Optional


def _load_rules() -> dict:
    config_path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "venues.yaml")
    config_path = os.path.normpath(config_path)
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


_RULES = None


def _get_rules() -> dict:
    global _RULES
    if _RULES is None:
        _RULES = _load_rules()
    return _RULES


def classify_catalog(title: str, summary: str) -> Optional[str]:
    """
    Classify a paper into one of the 5 catalog categories based on keyword matching.

    Returns the catalog name if a match is found, or None if classification is uncertain.
    """
    rules = _get_rules()
    keyword_rules: dict = rules.get("catalog_keywords", {})

    text = (title + " " + summary).lower()

    scores: dict[str, int] = {catalog: 0 for catalog in keyword_rules}
    for catalog, keywords in keyword_rules.items():
        for kw in keywords:
            if re.search(re.escape(kw.lower()), text):
                scores[catalog] += 1

    best_catalog = max(scores, key=lambda c: scores[c])
    best_score = scores[best_catalog]

    if best_score == 0:
        return None

    candidates = [c for c, s in scores.items() if s == best_score]
    if len(candidates) > 1:
        catalog_order = rules.get("catalogs", list(keyword_rules.keys()))
        for c in catalog_order:
            if c in candidates:
                return c

    return best_catalog
