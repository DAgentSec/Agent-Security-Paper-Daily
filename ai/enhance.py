import os
import json
import sys
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional

import requests
import dotenv
import argparse
from tqdm import tqdm

import langchain_core.exceptions
from langchain_openai import ChatOpenAI
from langchain_core.prompts import (
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
)
from structure import Structure

if os.path.exists(".env"):
    dotenv.load_dotenv()

template = open("template.txt", "r").read()
system = open("system.txt", "r").read()

_DEFAULT_AI_FIELDS = {
    "tldr": "Summary generation failed",
    "motivation": "Motivation analysis unavailable",
    "method": "Method extraction failed",
    "result": "Result analysis unavailable",
    "conclusion": "Conclusion extraction failed",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=str, required=True, help="jsonline data file")
    parser.add_argument("--max_workers", type=int, default=1)
    return parser.parse_args()


def _is_sensitive(content: str) -> bool:
    """Content moderation check. Returns False (pass) when the upstream
    spam-filter service is unreachable, so papers are never silently dropped
    due to network issues."""
    try:
        resp = requests.post(
            "https://spam.dw-dengwei.workers.dev",
            json={"text": content},
            timeout=5,
        )
        if resp.status_code == 200:
            return resp.json().get("sensitive", False)
        return False
    except Exception:
        return False


def _check_github_code(content: str) -> dict:
    code_info: dict = {}

    github_pattern = r"https?://github\.com/([a-zA-Z0-9-_]+)/([a-zA-Z0-9-_\.]+)"
    match = re.search(github_pattern, content)
    if match:
        owner, repo = match.groups()
        repo = repo.rstrip(".git").rstrip(".,)")
        full_url = f"https://github.com/{owner}/{repo}"
        code_info["code_url"] = full_url

        github_token = os.environ.get("TOKEN_GITHUB")
        headers = {"Accept": "application/vnd.github.v3+json"}
        if github_token:
            headers["Authorization"] = f"token {github_token}"

        try:
            api_url = f"https://api.github.com/repos/{owner}/{repo}"
            resp = requests.get(api_url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                code_info["code_stars"] = data.get("stargazers_count", 0)
                code_info["code_last_update"] = data.get("pushed_at", "")[:10]
        except Exception:
            pass
        return code_info

    github_io_pattern = r"https?://[a-zA-Z0-9-_]+\.github\.io(?:/[a-zA-Z0-9-_\.]+)*"
    match_io = re.search(github_io_pattern, content)
    if match_io:
        code_info["code_url"] = match_io.group(0).rstrip(".,)")

    return code_info


def process_single_item(chain, item: Dict, language: str) -> Optional[Dict]:
    if _is_sensitive(item.get("summary", "")):
        return None

    code_info = _check_github_code(item.get("summary", ""))
    if code_info:
        item.update(code_info)

    try:
        response: Structure = chain.invoke({
            "language": language,
            "content": item["summary"],
        })
        item["AI"] = response.model_dump()
    except langchain_core.exceptions.OutputParserException as e:
        error_msg = str(e)
        partial_data: dict = {}
        if "Function Structure arguments:" in error_msg:
            try:
                json_str = (
                    error_msg.split("Function Structure arguments:", 1)[1]
                    .strip()
                    .split("are not valid JSON")[0]
                    .strip()
                )
                json_str = json_str.replace("\\", "\\\\")
                partial_data = json.loads(json_str)
            except Exception as json_e:
                print(f"Failed to parse JSON for {item.get('id', 'unknown')}: {json_e}", file=sys.stderr)
        item["AI"] = {**_DEFAULT_AI_FIELDS, **partial_data}
        print(f"Using partial AI data for {item.get('id', 'unknown')}: {list(partial_data.keys())}", file=sys.stderr)
    except Exception as e:
        print(f"Unexpected error for {item.get('id', 'unknown')}: {e}", file=sys.stderr)
        item["AI"] = dict(_DEFAULT_AI_FIELDS)

    for field in _DEFAULT_AI_FIELDS:
        if field not in item["AI"]:
            item["AI"][field] = _DEFAULT_AI_FIELDS[field]

    for v in item.get("AI", {}).values():
        if _is_sensitive(str(v)):
            return None

    return item


def process_all_items(data: List[Dict], model_name: str, language: str, max_workers: int) -> List[Optional[Dict]]:
    llm = ChatOpenAI(model=model_name).with_structured_output(Structure, method="function_calling")
    print(f"Connect to: {model_name}", file=sys.stderr)

    prompt_template = ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate.from_template(system),
        HumanMessagePromptTemplate.from_template(template=template),
    ])
    chain = prompt_template | llm

    processed_data: List[Optional[Dict]] = [None] * len(data)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(process_single_item, chain, item, language): idx
            for idx, item in enumerate(data)
        }
        for future in tqdm(as_completed(future_to_idx), total=len(data), desc="Processing items"):
            idx = future_to_idx[future]
            try:
                processed_data[idx] = future.result()
            except Exception as e:
                print(f"Item at index {idx} generated an exception: {e}", file=sys.stderr)
                processed_data[idx] = data[idx]
                processed_data[idx]["AI"] = dict(_DEFAULT_AI_FIELDS)

    return processed_data


def main():
    args = parse_args()
    model_name = os.environ.get("MODEL_NAME", "deepseek-v4-flash")
    language = os.environ.get("LANGUAGE", "Chinese")

    target_file = args.data.replace(".jsonl", f"_AI_enhanced_{language}.jsonl")
    if os.path.exists(target_file):
        os.remove(target_file)
        print(f"Removed existing file: {target_file}", file=sys.stderr)

    data = []
    with open(args.data, "r") as f:
        for line in f:
            data.append(json.loads(line))

    seen_ids: set = set()
    unique_data = []
    for item in data:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            unique_data.append(item)
    data = unique_data
    print(f"Open: {args.data}", file=sys.stderr)

    processed_data = process_all_items(data, model_name, language, args.max_workers)

    with open(target_file, "w") as f:
        for item in processed_data:
            if item is not None:
                f.write(json.dumps(item) + "\n")


if __name__ == "__main__":
    main()
