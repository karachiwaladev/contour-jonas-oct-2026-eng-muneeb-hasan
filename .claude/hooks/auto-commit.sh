#!/usr/bin/env bash
# Stop hook: commit any changes in the project and push them to its remote.
# Non-destructive by design: never forces, never rewrites pushed history, skips
# while a merge/rebase is in progress, and refuses to commit likely secrets
# (see secret-scan.sh).

say() { printf '{"systemMessage": "auto-commit: %s"}\n' "$1"; }
git_push() { git -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"; }

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

git_dir=$(git rev-parse --git-dir)
for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
  if [ -e "$git_dir/$marker" ]; then say "skipped, a git operation is in progress"; exit 0; fi
done
branch=$(git symbolic-ref --short -q HEAD) || { say "skipped, HEAD is detached"; exit 0; }

if [ -n "$(git status --porcelain)" ]; then
  git add -A 2>/dev/null
  # Keep likely secrets out of history (by file name or by token/key content):
  # unstage those files and warn instead.
  secrets=$(bash "$(dirname "$0")/secret-scan.sh")
  if [ -n "$secrets" ]; then
    echo "$secrets" | while IFS= read -r f; do git reset -q -- "$f"; done
    held=$(echo "$secrets" | tr '\n' ' ')
  fi
  files=$(git diff --cached --name-only)
  if [ -n "$files" ]; then
    count=$(echo "$files" | wc -l | tr -d ' ')
    summary=$(echo "$files" | head -5 | tr '\n' ',' | sed 's/,$//; s/,/, /g')
    [ "$count" -gt 5 ] && summary="$summary (+$((count - 5)) more)"
    git commit -q -m "Auto-commit on stop: $summary" \
      -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || { say "commit failed"; exit 0; }
  fi
fi

if git rev-parse -q --verify "@{u}" >/dev/null; then
  ahead=$(git rev-list --count "@{u}..HEAD")
else
  ahead=$(git rev-list --count HEAD)
fi
if [ "$ahead" = "0" ]; then
  [ -n "$held" ] && say "did not commit possible secrets: $held"
  exit 0
fi

if ! git_push push -q origin "HEAD:$branch" >/dev/null 2>&1; then
  # The remote moved: replay our commits on top, never force.
  if ! git_push pull -q --rebase origin "$branch" >/dev/null 2>&1; then
    git rebase --abort >/dev/null 2>&1
    say "push rejected and rebase conflicted; resolve manually ($ahead local commit(s) on $branch)"
    exit 0
  fi
  git_push push -q origin "HEAD:$branch" >/dev/null 2>&1 || { say "push failed ($ahead local commit(s) on $branch)"; exit 0; }
fi

msg="pushed $ahead commit(s) to origin/$branch"
[ -n "$held" ] && msg="$msg; did not commit possible secrets: $held"
say "$msg"
