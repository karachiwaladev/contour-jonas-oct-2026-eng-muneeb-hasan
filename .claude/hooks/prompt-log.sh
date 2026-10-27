#!/usr/bin/env bash
# Stop hook: record the prompts typed this session on the `prompt-log` branch.
#
# The log lives in its own git worktree inside .git (.git/prompt-log), checked out on
# the `prompt-log` branch, so logging never changes main or the branch being worked
# on. log-prompts.py appends any new prompts there; this script commits and pushes
# them. Same safety rules as auto-commit.sh: never forces, never rewrites history.
# Reads the Stop hook payload on stdin and passes it to log-prompts.py.

# Plain text: settings.json hands this to auto-commit.sh, which prints the one JSON message.
say() { printf 'prompt-log: %s' "$1"; }
# longpaths: on Windows a rebase inside .git/prompt-log can pass the 260-character path limit.
git_auth() { git -c core.longpaths=true -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"; }

payload=$(cat)
hooks="$(cd "$(dirname "$0")" && pwd)"
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Kept relative: the path is handed to Python, which wouldn't read a Git Bash /d/... path.
wt="$(git rev-parse --git-common-dir)/prompt-log"
branch=prompt-log

if [ ! -e "$wt/.git" ]; then
  git worktree prune
  git_auth fetch -q origin "$branch" 2>/dev/null
  if git rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
    git worktree add -q "$wt" "$branch" || { say "couldn't create the log worktree"; exit 0; }
  elif git rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null; then
    git worktree add -q --track -b "$branch" "$wt" "origin/$branch" || { say "couldn't create the log worktree"; exit 0; }
  else
    # First run: start the branch from the default branch, so it carries the log so far.
    base=$(git symbolic-ref -q --short refs/remotes/origin/HEAD || echo origin/main)
    git worktree add -q -b "$branch" "$wt" "$base" || { say "couldn't create the log worktree"; exit 0; }
  fi
fi

printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$wt" python "$(dirname "$0")/log-prompts.py" || { say "logging failed"; exit 0; }

cd "$wt" || exit 0
git add .claude/prompts.jsonl
git diff --cached --quiet && exit 0
# A typed prompt can contain a token: keep it out of history and say so.
if [ -n "$(bash "$hooks/secret-scan.sh")" ]; then
  git reset -q -- .claude/prompts.jsonl
  say "did not commit the log: a new prompt looks like it contains a secret (see $wt/.claude/prompts.jsonl)"
  exit 0
fi
new=$(git diff --cached --numstat -- .claude/prompts.jsonl | cut -f1)
git commit -q -m "Log $new prompt(s)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || { say "commit failed"; exit 0; }

if ! git_auth push -q origin "HEAD:$branch" >/dev/null 2>&1; then
  # The remote branch moved: replay on top, never force.
  if ! git_auth pull -q --rebase origin "$branch" >/dev/null 2>&1; then
    git rebase --abort >/dev/null 2>&1
    say "push rejected and rebase conflicted; the log is committed locally in $wt"
    exit 0
  fi
  git_auth push -q origin "HEAD:$branch" >/dev/null 2>&1 || { say "push failed; the log is committed locally in $wt"; exit 0; }
fi
git branch -q --set-upstream-to="origin/$branch" 2>/dev/null
say "logged $new prompt(s) to origin/$branch"
