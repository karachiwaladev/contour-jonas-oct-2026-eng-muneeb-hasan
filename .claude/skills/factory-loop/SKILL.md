---
name: factory-loop
description: Work through a GitHub repo's open issues end to end. Acknowledge each one with a 👀 reaction, read the question in the ticket, post an answer as a comment, and close it as completed. Before any write it checks which gh account is active and what permission that account has on the repo, so Enterprise Managed User (EMU) 403s and read-only access get diagnosed instead of retried. Re-running it is safe, so it fits /loop (e.g. `/loop 5m /factory-loop`). Use this whenever the user asks to fetch, triage, answer, respond to, react to or close GitHub issues or tickets, "work the issue queue", "answer the tickets", or keep watching a repo for new questions, even if they don't say "factory-loop".
---

# factory-loop

Turn a repo's open issues into answered, closed tickets: **fetch → acknowledge → read → answer → close → report**. Each pass leaves the queue a little emptier. A pass that finds nothing to do should be quiet and cheap, so the skill can run repeatedly under `/loop`.

Run the commands with the Bash tool. All examples use the `gh` CLI.

## 0. Figure out the mode

- **Live** (default): do the actions.
- **Dry run**: the user said "dry run", "preview", "what would you do" or similar. Do every read step for real. Then, instead of reacting, commenting or closing, write out what you *would* have done: the exact `gh` commands and the full comment bodies. Never call a write endpoint in a dry run, because the point is that nothing on GitHub changes.

## 1. Resolve the repo

Use the repo the user names. Otherwise use the current directory's remote:

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner
```

Pass `--repo OWNER/NAME` to every later `gh` call so a stray `cd` can't point it at the wrong repo.

## 2. Preflight: who am I, and what am I allowed to do?

This step exists because of two failures that look identical from the outside (both are 403s) but have different fixes:

```bash
gh auth status 2>&1                                   # which accounts, which one is active
gh api user --jq .login                               # the acting login
gh api repos/OWNER/NAME --jq '.permissions'           # {pull, triage, push, maintain, admin}
```

Work out the following before writing anything:

| Situation | How to recognise it | What it blocks | Fix |
|---|---|---|---|
| **EMU account on an outside repo** | Login is an Enterprise Managed User, usually `name_shortcode` (e.g. `Jane-Doe_Acme`). A write returns `As an Enterprise Managed User, you cannot access this content`. | *All* writes: reactions, comments, closing. Reads still work. | Use a non-EMU account (see below). Token scopes won't help, because this is enterprise policy. |
| **Read-only access** | `permissions.triage` and `permissions.push` are both `false`. | Closing (unless the acting user opened the issue). Reacting and commenting still work on public repos. | A repo admin grants triage or write access, or the issue author closes it. |

If the active account is EMU and `gh auth status` lists another, non-EMU account, use that account's token for this run's commands only. This leaves the user's global `gh` state alone:

```bash
export GH_TOKEN="$(gh auth token --user OTHER_LOGIN)"
```

If there's no other account, stop before any writes and tell the user to run `! gh auth login` with a personal account. Don't attempt writes you already know will 403.

Permissions can change in the middle of a session (an admin grants access). If an earlier pass was blocked, re-check `permissions` instead of assuming.

## 3. Fetch issues and pick the ones that need work

```bash
gh issue list --repo OWNER/NAME --state open --limit 100 \
  --json number,title,author,createdAt,comments,url
```

For each candidate, load the full thread:

```bash
gh issue view N --repo OWNER/NAME --json number,title,body,author,state,comments,reactionGroups,url
```

An issue **needs work** if it's open and either:
- the acting account hasn't commented on it yet, or
- someone else commented *after* the acting account's latest comment (a follow-up question).

Also skip a non-question issue (step 5) that you already flagged on an earlier pass: the acting account has a 👀 on it, nobody has commented since, and you haven't commented. Check with `gh api repos/OWNER/NAME/issues/N/reactions --jq '[.[] | select(.content=="eyes") | .user.login]'`. Without this check, every loop tick would re-flag the same ticket.

Skip everything else. This is what makes the skill safe to loop: an issue you've already answered never gets a second, duplicate answer. If you find an issue you answered but didn't close (a previous pass was blocked on permissions), it only needs the close step.

Pull requests aren't issues for this workflow, so ignore them.

## 4. Acknowledge with 👀

React before doing the slower work so watchers can see someone has picked it up:

```bash
gh api -X POST repos/OWNER/NAME/issues/N/reactions -f content=eyes --jq .content
```

Re-posting an existing reaction is harmless (GitHub returns the existing one), so you don't need to check first.

## 5. Read the question and answer it

Read the title, the body **and** the existing comments. Title and body sometimes disagree, and a late comment may refine the ask. Work out what is actually being asked.

- **It's a question** (factual, how-to, "which/what/why"): answer it.
  - Lead with the direct answer in bold, then 1–3 supporting bullets, then at most one line of context. People skim tickets.
  - Use real figures, and name where they come from and when (e.g. "2023 census"). If the fact could have changed since your training (populations, prices, versions, "latest" anything), check it with WebSearch first. If sources disagree, give the range and say why.
  - If the question is ambiguous ("largest" by area or by population?), answer the likeliest reading and add one line on the other reading. Don't stall the ticket with a clarifying question unless no reasonable answer exists.
- **It's a follow-up**: answer only the new question and refer back to your earlier comment instead of repeating it.
- **It isn't a question** (bug report, feature request, a code change, something that needs a human decision): don't make up an answer. Leave it open, add nothing beyond the 👀, and list it in the report so the user can decide.

Write the body to a file in the scratchpad (or a temp dir) and post it with `--body-file`. Inline `--body` strings break on quotes, backticks and newlines, and break differently in PowerShell and in Bash:

```bash
gh issue comment N --repo OWNER/NAME --body-file /path/to/comment.md
```

Keep the comment URL that `gh` prints for the report.

## 6. Close as completed

Close only issues you answered (or answered in an earlier pass). Never close the non-question issues from step 5.

```bash
gh issue close N --repo OWNER/NAME --reason completed
gh issue view N --repo OWNER/NAME --json state,stateReason --jq '"\(.state) \(.stateReason)"'
```

If the preflight showed no triage/push access and the acting user isn't the issue author, skip the close and say so in the report. Don't try it and collect a 403, and don't post a "please close this" comment unless the user asks for one.

## 7. Report

Finish with a short summary the user can scan:

```
factory-loop · OWNER/NAME · acting as LOGIN
#12 Largest city in Pakistan: 👀, answered (comment URL), closed ✓
#13 Login button broken: 👀, not a question, left open for you
#14 Capital of Japan: 👀, answered, NOT closed (read-only access; needs triage)
```

On a pass with nothing to do, report it in one line (`factory-loop: no open issues need work in OWNER/NAME`). Under `/loop` that line repeats every tick, so keep it that short.

If a step failed, include GitHub's exact error message and the fix from the step 2 table, so the user doesn't have to diagnose it again.

## Running it on a loop

The user can repeat it with `/loop 5m /factory-loop` (or another interval). Because of step 3, each tick only touches new or follow-up issues. If the loop is cron-based, the user stops it with CronDelete and the job ID.
