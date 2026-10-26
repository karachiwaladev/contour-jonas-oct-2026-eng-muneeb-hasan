#!/usr/bin/env bash
# Prints each staged file that looks like it contains a secret, one per line.
# Checks file names (.env, keys, certificates) and the lines being added
# (tokens and private keys with well-known formats). Exit 1 if anything is found.
# Usage: run from the repo root after `git add`. Used by auto-commit.sh and the
# factory-loop skill before every commit.

NAME_RE='(^|/)(\.env(\..*)?|id_rsa[^/]*|id_ed25519[^/]*|[^/]*\.(pem|key|p12|pfx)|credentials[^/]*)$'
CONTENT_RE='gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-ant-[A-Za-z0-9_-]{20,}|sk-(proj-)?[A-Za-z0-9]{40,}'

found=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  if printf '%s\n' "$file" | grep -qiE "$NAME_RE"; then
    printf '%s\n' "$file"; found=1; continue
  fi
  # Only added lines, so an existing file isn't flagged for something already removed.
  if git diff --cached -U0 --no-color -- "$file" | grep -E '^\+' | grep -v '^+++' | grep -qE "$CONTENT_RE"; then
    printf '%s\n' "$file"; found=1
  fi
done < <(git diff --cached --name-only --diff-filter=AM)

exit $found
