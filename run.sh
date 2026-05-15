#!/bin/bash
set -e

if [ -z "$OPENAI_API_KEY" ]; then
    echo "Warning: OPENAI_API_KEY not set. Skipping AI enhancement and Markdown conversion."
    PARTIAL_MODE=true
else
    PARTIAL_MODE=false
    export LANGUAGE="${LANGUAGE:-Chinese}"
    export CATEGORIES="${CATEGORIES:-cs.CR,cs.AI}"
    export MODEL_NAME="${MODEL_NAME:-deepseek-v4-flash}"
    export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
fi

today=$(date -u "+%Y-%m-%d")

echo "=== Step 1: Process pending tickets ==="
python tickets/process_tickets.py --output data/${today}.jsonl || true

echo "=== Step 2: Crawl arXiv papers ==="
cd daily_arxiv
scrapy crawl arxiv -o ../data/${today}.jsonl

if [ ! -f "../data/${today}.jsonl" ]; then
    echo "Crawling failed, no data file generated"
    exit 1
fi

echo "=== Step 3: Deduplication check ==="
set +e
python daily_arxiv/check_stats.py
dedup_exit_code=$?
set -e

case $dedup_exit_code in
    0) ;;
    1) echo "No new content after deduplication"; exit 1 ;;
    2) echo "Deduplication error"; exit 2 ;;
    *) echo "Unknown exit code"; exit 1 ;;
esac

cd ..

if [ "$PARTIAL_MODE" = "false" ]; then
    echo "=== Step 4: AI Enhancement ==="
    cd ai
    python enhance.py --data ../data/${today}.jsonl
    cd ..

    echo "=== Step 5: Convert to Markdown ==="
    cd to_md
    AI_FILE="../data/${today}_AI_enhanced_${LANGUAGE}.jsonl"
    if [ -f "$AI_FILE" ]; then
        python convert.py --data "$AI_FILE"
    else
        echo "Error: AI enhanced file not found: $AI_FILE"
        exit 1
    fi
    cd ..
else
    echo "Skipping AI enhancement and Markdown conversion (OPENAI_API_KEY not set)"
fi

echo "=== Step 6: Update file list ==="
ls data/*.jsonl | sed 's|data/||' > assets/file-list.txt

echo "=== Done ==="
