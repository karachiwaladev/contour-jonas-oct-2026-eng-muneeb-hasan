"""Stop hook: append the session's new user prompts to .claude/prompts.jsonl.

Reads the hook payload on stdin, scans the session transcript for prompts the
user typed (including slash commands), and appends any not already logged.
Loop ticks, subagent messages, task notifications and `!` shell output are
skipped because they aren't prompts the user wrote.
"""
import json
import os
import re
import sys

LOG_NAME = os.path.join(".claude", "prompts.jsonl")
COMMAND_NAME_RE = re.compile(r"<command-name>(.*?)</command-name>", re.S)
COMMAND_ARGS_RE = re.compile(r"<command-args>(.*?)</command-args>", re.S)


def prompt_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if b.get("type") == "text")
    return ""


def to_record(entry):
    if entry.get("type") != "user" or entry.get("isMeta") or entry.get("isSidechain"):
        return None
    if (entry.get("origin") or {}).get("kind") != "human":
        return None
    text = prompt_text(entry.get("message", {}).get("content")).strip()
    if not text:
        return None
    kind = "typed"
    name = COMMAND_NAME_RE.search(text)
    if name:
        kind = "command"
        args = COMMAND_ARGS_RE.search(text)
        text = f"{name.group(1).strip()} {args.group(1).strip() if args else ''}".strip()
    return {
        "timestamp": entry.get("timestamp"),
        "session_id": entry.get("sessionId"),
        "uuid": entry.get("uuid"),
        "kind": kind,
        "prompt": text,
    }


def main():
    payload = json.load(sys.stdin)
    transcript = payload.get("transcript_path")
    if not transcript or not os.path.exists(transcript):
        return
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    log_path = os.path.join(project_dir, LOG_NAME)

    logged = set()
    if os.path.exists(log_path):
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                try:
                    logged.add(json.loads(line).get("uuid"))
                except ValueError:
                    continue

    new = []
    with open(transcript, encoding="utf-8") as f:
        for line in f:
            try:
                record = to_record(json.loads(line))
            except ValueError:
                continue
            if record and record["uuid"] not in logged:
                new.append(record)
                logged.add(record["uuid"])

    if new:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "a", encoding="utf-8", newline="\n") as f:
            for record in new:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
