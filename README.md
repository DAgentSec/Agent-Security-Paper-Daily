# Agent Security Paper Daily

Daily curated papers on Agent Security from arXiv and top conferences (S&P, CCS, USENIX, NeurIPS, …), enhanced with AI-generated structured summaries.

Papers are classified into five catalogs: **Agent Sec · Agent for Sec · Infra · Frontier Sec · Model**.

---

## Quick Setup

### 1 — Fork / create the repository

Push this codebase to a new GitHub repository.

### 2 — Configure GitHub Secrets

Go to **Settings → Secrets and variables → Actions → Secrets** and add:

| Secret | Value |
|--------|-------|
| `OPENAI_API_KEY` | Your DeepSeek API key |
| `OPENAI_BASE_URL` | `https://api.deepseek.com` |
| `ACCESS_PASSWORD` | Website login password (leave empty to disable auth) |
| `TOKEN_GITHUB` | GitHub Personal Access Token (optional, for code-repo info in AI summaries) |

### 3 — Configure GitHub Variables

Go to **Settings → Secrets and variables → Actions → Variables** and add:

| Variable | Example value | Notes |
|----------|---------------|-------|
| `MODEL_NAME` | `deepseek-v4-flash` | DeepSeek model to use for AI summaries |
| `LANGUAGE` | `Chinese` | Output language for AI summaries (`Chinese` or `English`) |
| `CATEGORIES` | `cs.CR,cs.AI,cs.LG,cs.CL` | Comma-separated arXiv categories to scrape |
| `MAX_PAPERS` | `10` | Max papers **per category** per day (0 = no limit) |
| `KEYWORDS` | `agent,jailbreak,prompt injection,LLM security` | Comma-separated keywords — papers matching more keywords are fetched first within the `MAX_PAPERS` quota |
| `NAME` | `arxiv-bot` | Git commit author name |
| `EMAIL` | `bot@example.com` | Git commit author email |

### 4 — Enable GitHub Pages

Go to **Settings → Pages** and set:

- **Source**: Deploy from a branch
- **Branch**: `main` · folder `/ (root)`

### 5 — Enable workflow permissions

Go to **Settings → Actions → General → Workflow permissions** and select:

- **Read and write permissions**

### 6 — Trigger first run

Go to **Actions → agent-security-paper-daily → Run workflow**.

The workflow will:
1. Replace all `PLACEHOLDER_*` values in `index.html` / `js/data-config.js` / `js/auth-config.js` with your actual repo and password info and commit them to `main` — GitHub Pages picks this up automatically.
2. Crawl today's arXiv papers and merge any pending conference paper tickets.
3. Run AI enhancement with `deepseek-v4-flash`.
4. Push data (JSONL + Markdown) to the `data` branch.

The site is live at `https://<username>.github.io/<repo-name>/`.

---

## Daily Workflow (automated)

The Action runs every day at **01:30 UTC** (cron `30 1 * * *`).

```
Tickets (pending/)  ──┐
                       ├──► merge ──► dedup ──► AI (deepseek-v4-flash) ──► Markdown
arXiv crawl         ──┘                                ▼
                                               data branch (JSONL)
                                                       ▼
                                          GitHub Pages (index.html on main)
```

---

## Conference Paper Tickets

To add a conference paper manually, create a `.json` file in `tickets/pending/`:

```json
{
  "id": "ccs2025-example",
  "title": "Paper Title",
  "authors": ["Author One", "Author Two"],
  "summary": "Abstract text...",
  "pdf": "https://example.com/paper.pdf",
  "abs": "https://example.com/paper",
  "venue_name": "CCS",
  "venue_year": 2025,
  "catalog": "Agent Sec"
}
```

Required fields: `pdf` or `abs`, `venue_name`, `venue_year`, `catalog` (one of the five catalogs).

Supported venues: **S&P, USENIX Security, CCS, NDSS** (security) · **ICSE, FSE, ASE, ISSTA** (SE) · **NeurIPS, ICML, ICLR, AAAI, IJCAI, ACL, EMNLP** (AI).

Tickets are validated and merged into the daily pipeline on the next workflow run.

---

## Catalogs

| Catalog | Scope |
|---------|-------|
| **Agent Sec** | Security of agents / LLMs — jailbreak, prompt injection, tool abuse, multi-agent attacks |
| **Agent for Sec** | Using agents for security tasks — threat hunting, vuln analysis, fuzzing, blue-team automation |
| **Infra** | Infrastructure supporting agents — eval platforms, sandboxes, orchestration, observability |
| **Frontier Sec** | Broad frontier security — novel attack surfaces, cross-domain threats |
| **Model** | Model capabilities, alignment, robustness, safety training |

---

## Repository Secrets & Variables Reference

### Secrets

| Name | Required | Description |
|------|----------|-------------|
| `OPENAI_API_KEY` | **Yes** | DeepSeek API key (`sk-...`) |
| `OPENAI_BASE_URL` | **Yes** | `https://api.deepseek.com` |
| `ACCESS_PASSWORD` | No | Website password; empty = no auth |
| `TOKEN_GITHUB` | No | GitHub PAT for code-repo enrichment in summaries |

### Variables

| Name | Default | Description |
|------|---------|-------------|
| `MODEL_NAME` | `deepseek-v4-flash` | AI model for summaries |
| `LANGUAGE` | `Chinese` | Summary output language |
| `CATEGORIES` | `cs.CR,cs.AI` | arXiv categories to scrape |
| `MAX_PAPERS` | `10` | Max papers per category (0 = no limit) |
| `KEYWORDS` | `agent,jailbreak,LLM security` | Keyword priority filter (comma-separated) |
| `NAME` | — | Git commit author name |
| `EMAIL` | — | Git commit author email |

---

## Local Development

```bash
# Install dependencies (requires Python 3.12+)
pip install uv
uv sync

# Set environment variables
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.deepseek.com
export MODEL_NAME=deepseek-v4-flash
export LANGUAGE=Chinese
export CATEGORIES=cs.CR,cs.AI

# Run full pipeline
bash run.sh
```
