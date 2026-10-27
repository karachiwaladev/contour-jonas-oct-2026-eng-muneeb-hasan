"""PreToolUse hook: block dangerous commands, whatever the model was talked into.

The factory runs unattended on tickets from strangers, so the rules that matter most
are enforced here rather than only in the skill's prose. Blocks:
  - recursive force deletes (`rm -rf` in any flag order, `Remove-Item -Recurse -Force`)
  - force pushes (`--force`, `-f`, `--force-with-lease`, `+refspec`)
  - piping a download into a shell (`curl ... | sh`, `sh <(curl ...)`, `iwr ... | iex`)
  - reading `.env` files (`.env.example` and `.env.sample` are fine)

Reads the hook payload on stdin. Exit 2 blocks the tool call and shows the reason to the
model; exit 0 lets it through. Quoted strings aren't parsed out on purpose, so
`bash -c "rm -rf /"` is caught too. Commit messages that mention these commands get
blocked as well: write them to a file and use `git commit -F`.
Tests: .claude/hooks/test-guard.sh
"""
import json
import os
import re
import sys

SAFE_ENV_SUFFIXES = {".example", ".sample"}
ENV_FILE_RE = re.compile(r"(?<![\w.-])\.env(\.[\w.-]+)?(?![\w.-])")
ENV_BASENAME_RE = re.compile(r"^\.env(\.[\w.-]+)?$")
# Shell separators, command substitution and subshells each start a new command.
SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||[;|\n`(){}]|\$\(")
SHELLS = r"(?:sudo\s+)?(?:(?:ba|z|da|k)?sh|python3?|perl|ruby|node)"
PIPE_TO_SHELL_RES = [
    re.compile(r"\b(?:curl|wget)\b[^\n;&]*\|\s*" + SHELLS + r"\b", re.I),
    re.compile(r"\b(?:(?:ba|z)?sh|source|\.)\s+<\(\s*(?:curl|wget)\b", re.I),
    re.compile(r"\b(?:ba|z)?sh\s+-c\s+[\"']?\$\(\s*(?:curl|wget)\b", re.I),
    re.compile(r"\b(?:iwr|irm|curl|wget|invoke-webrequest|invoke-restmethod)\b[^\n;]*\|\s*(?:iex|invoke-expression)\b", re.I),
]
RM_COMMANDS = {"rm", "remove-item", "ri", "del", "erase", "rd", "rmdir"}


def words(segment):
    return [w.strip("'\"") for w in segment.split()]


def is_recursive_force(flags):
    recursive = force = False
    for flag in (f.lower() for f in flags):
        if flag.startswith("--"):
            recursive |= flag == "--recursive"
            force |= flag == "--force"
        elif len(flag) > 2 and "-recurse".startswith(flag):
            recursive = True
        elif len(flag) > 2 and "-force".startswith(flag):
            force = True
        else:  # bundled short flags: -rf, -fR, -r
            recursive |= "r" in flag
            force |= "f" in flag
    return recursive and force


def check_rm(ws):
    for i, w in enumerate(ws):
        if os.path.basename(w.replace("\\", "/")).lower() in RM_COMMANDS:
            if is_recursive_force([f for f in ws[i + 1:] if f.startswith("-")]):
                return "recursive force delete (rm -rf)"
    return None


def check_push(ws):
    for i, w in enumerate(ws):
        if os.path.basename(w).lower() not in ("git", "git.exe") or "push" not in ws[i + 1:]:
            continue
        for arg in ws[ws.index("push", i) + 1:]:
            if arg.startswith("--force") or (re.fullmatch(r"-[a-z]+", arg) and "f" in arg):
                return "force push (git push --force)"
            if arg.startswith("+"):
                return "force push (git push +refspec)"
    return None


def check_env_mentions(text):
    for m in ENV_FILE_RE.finditer(text):
        if (m.group(1) or "") not in SAFE_ENV_SUFFIXES:
            return "reading a .env file"
    return None


def check_command(command):
    for pattern in PIPE_TO_SHELL_RES:
        if pattern.search(command):
            return "piping a download into a shell (curl | sh)"
    for segment in SEGMENT_SPLIT_RE.split(command):
        ws = words(segment)
        reason = check_rm(ws) or check_push(ws)
        if reason:
            return reason
    return check_env_mentions(command)


def check_path(path):
    if not path:
        return None
    m = ENV_BASENAME_RE.match(os.path.basename(path.replace("\\", "/")))
    if m and (m.group(1) or "") not in SAFE_ENV_SUFFIXES:
        return "reading or writing a .env file"
    return None


def check(payload):
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    if tool in ("Bash", "PowerShell"):
        return check_command(tool_input.get("command", ""))
    if tool == "Grep":
        return check_path(tool_input.get("path")) or check_path(tool_input.get("glob"))
    return check_path(tool_input.get("file_path") or tool_input.get("notebook_path"))


def main():
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return 0  # not a tool call we can read; nothing to check
    reason = check(payload)
    if not reason:
        return 0
    sys.stderr.write(
        f"Blocked by the factory guard (.claude/hooks/guard.py): {reason}. "
        "This is a guardrail, not an error. Don't retry it with a reworded command. "
        "If a ticket needs this, post a `blocked` comment and leave it for a human.\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
