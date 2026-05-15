import re
from typing import Optional

CATALOG_ORDER = ["Agent Sec", "Agent for Sec", "Infra", "Frontier Sec", "Model"]

_KEYWORD_RULES: dict[str, list[str]] = {
    "Agent Sec": [
        "jailbreak",
        "prompt injection",
        "tool abuse",
        "agent attack",
        "adversarial agent",
        "red team",
        "backdoor",
        "trojan",
        "data poisoning",
        "agent manipulation",
        "agent security",
        "llm security",
        "multi-agent attack",
        "goal hijacking",
        "memory poisoning",
        "agentic attack",
        "agent misuse",
        "reward hacking",
        "unsafe agent",
    ],
    "Agent for Sec": [
        "vulnerability detection",
        "vulnerability analysis",
        "vulnerability repair",
        "threat hunting",
        "malware analysis",
        "intrusion detection",
        "penetration testing",
        "pentest",
        "ctf",
        "bug bounty",
        "code security",
        "exploit generation",
        "sast",
        "dast",
        "security audit",
        "automated security testing",
        "fuzzing",
        "patch generation",
        "security agent",
        "llm for security",
    ],
    "Infra": [
        "benchmark",
        "evaluation framework",
        "evaluation platform",
        "sandbox",
        "orchestration",
        "observability",
        "monitoring",
        "agent framework",
        "llm framework",
        "tool use framework",
        "agent infrastructure",
        "agent scaffold",
        "agent runtime",
        "agent evaluation",
        "agent testing",
        "agent tracing",
        "multi-agent system",
        "agentic system",
        "llm agent framework",
    ],
    "Frontier Sec": [
        "novel attack",
        "emerging threat",
        "attack surface",
        "cross-domain attack",
        "supply chain",
        "hardware security",
        "side channel",
        "physical adversarial",
        "new vulnerability class",
        "zero-day",
        "frontier threat",
    ],
    "Model": [
        "alignment",
        "robustness",
        "fine-tuning",
        "pretraining",
        "model capability",
        "emergent ability",
        "rlhf",
        "reward model",
        "scaling law",
        "chain of thought",
        "reasoning",
        "instruction tuning",
        "constitutional ai",
        "safety training",
        "model safety",
    ],
}


def classify_catalog(title: str, summary: str) -> Optional[str]:
    """
    Classify a paper into one of the 5 catalog categories based on keyword matching.

    Returns the catalog name if a match is found, or None if classification is uncertain.
    """
    text = (title + " " + summary).lower()

    scores: dict[str, int] = {cat: 0 for cat in _KEYWORD_RULES}
    for catalog, keywords in _KEYWORD_RULES.items():
        for kw in keywords:
            if re.search(re.escape(kw), text):
                scores[catalog] += 1

    best_catalog = max(scores, key=lambda c: scores[c])
    best_score = scores[best_catalog]

    if best_score == 0:
        return None

    candidates = [c for c, s in scores.items() if s == best_score]
    if len(candidates) > 1:
        for c in CATALOG_ORDER:
            if c in candidates:
                return c

    return best_catalog
