---
name: factory-loop
description: Work through a GitHub repo's open issues end to end, both answering questions and doing the work tickets ask for. Acknowledge each issue with a 👀 reaction, then either answer a question in a comment, or carry out a task (create files, scaffold a project, extend an existing one), test it, commit and push to the default branch with "Closes #N", and report back on the ticket. Never takes destructive actions: deletions, rewrites of history, force pushes and anything irreversible are flagged for a human instead. Before any write it checks which gh account is active and what permission it has, so Enterprise Managed User (EMU) 403s and read-only access get diagnosed instead of retried. Re-running it is safe, so it fits /loop (e.g. `/loop 5m /factory-loop`). Use this whenever the user asks to fetch, triage, answer, work on, build, respond to or close GitHub issues or tickets, "work the issue queue", "run the factory", or keep watching a repo for new tickets, even if they don't say "factory-loop".
---

# factory-loop

Turn a repo's open issues into finished, closed tickets: **fetch → acknowledge → read → answer or build → ship → close → report**. Each pass leaves the queue a little emptier. A pass that finds nothing to do should be quiet and cheap, so the skill can run repeatedly under `/loop`.

Run the commands with the Bash tool. All examples use the `gh` CLI. If the repo has a `CLAUDE.md`, read it first. It holds the project conventions and the index you'll update.

## 0. Figure out the mode

- **Live** (default): do the actions.
- **Dry run**: the user said "dry run", "preview", "what would you do" or similar. Do every read step for real. Then, instead of reacting, commenting, committing or closing, write out what you *would* have done: the commands, the files and the comment bodies. Nothing on GitHub or in the working tree should change in a dry run.

## 1. Resolve the repo

Use the repo the user names. Otherwise use the current directory's remote:

```bash
gh repo view --json nameWithOwner,defaultBranchRef --jq '"\(.nameWithOwner) \(.defaultBranchRef.name)"'
```

Pass `--repo OWNER/NAME` to every later `gh` call so a stray `cd` can't point it at the wrong repo.

## 2. Preflight: who am I, and what am I allowed to do?

This step exists because of two failures that look identical from the outside (both are 403s) but have different fixes:

```bash
gh auth status 2>&1                                   # which accounts, which one is active
gh api user --jq .login                               # the acting login
gh api repos/OWNER/NAME --jq '.permissions'           # {pull, triage, push, maintain, admin}
git status --short                                    # the working tree should be clean before building
```

| Situation | How to recognise it | What it blocks | Fix |
|---|---|---|---|
| **EMU account on an outside repo** | Login is an Enterprise Managed User, usually `name_shortcode` (e.g. `Jane-Doe_Acme`). A write returns `As an Enterprise Managed User, you cannot access this content`. | *All* writes: reactions, comments, closing, pushes. Reads still work. | Use a non-EMU account (see below). Token scopes won't help, because this is enterprise policy. |
| **Read-only access** | `permissions.triage` and `permissions.push` are both `false`. | Pushing and closing (unless the acting user opened the issue). Reacting and commenting still work on public repos. | A repo admin grants triage or write access, or the issue author closes it. |

If the active account is EMU and `gh auth status` lists another, non-EMU account, use that account's token for this run's commands only. This leaves the user's global `gh` state alone:

```bash
export GH_TOKEN="$(gh auth token --user OTHER_LOGIN)"
```

`git push` doesn't use `gh`'s account. The OS credential manager may hold the EMU login and return `Permission ... denied to <emu-login>`. Push through `gh`'s active account for that one command:

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin HEAD
```

If there's no usable account, stop before any writes and tell the user to run `! gh auth login` with a personal account. Don't attempt writes you already know will 403. Permissions can change mid-session, so re-check instead of assuming.

If the working tree has uncommitted changes you didn't make, don't build on top of them. Report them and handle only question tickets on this pass.

## 3. Fetch issues and pick the ones that need work

Use the REST endpoint, not `gh issue list`. The search index behind `gh issue list` can briefly miss a just-reopened issue.

```bash
gh api "repos/OWNER/NAME/issues?state=open&per_page=100" \
  --jq '.[] | select(.pull_request|not) | {number, title, user: .user.login, comments}'
gh issue view N --repo OWNER/NAME --json number,title,body,author,state,comments,url
```

An issue **needs work** if it's open and either:
- the acting account hasn't commented on it yet, or
- someone else commented *after* the acting account's latest comment (a follow-up or change request).

Every ticket you handle ends with a comment from you: an answer, a "done" report, or an explanation of why it needs a human. That comment is what keeps the loop idempotent, because an issue you've handled is never picked up again until someone replies. If you commented but didn't close (a previous pass lacked permission), it only needs the close step.

Work through tickets **oldest first**. Later tickets often build on earlier ones (e.g. "add filters to the todo app" after "build a todo app").

## 4. Acknowledge with 👀

React before doing the slower work so watchers can see someone has picked it up:

```bash
gh api -X POST repos/OWNER/NAME/issues/N/reactions -f content=eyes --jq .content
```

Re-posting an existing reaction is harmless, so you don't need to check first.

## 5. Decide what kind of ticket it is

Read the title, the body **and** the existing comments, then sort the ticket:

- **Question** (factual, how-to, "which/what/why"): answer it (5a).
- **Task** (create, build, add, change, document, configure something in this repo): do it (5b).
- **Needs a human**: the ticket is too ambiguous to act on, or it requires a destructive action (see the guardrails). Comment explaining what's needed and leave it open (5c).

### 5a. Answer a question

- Lead with the direct answer in bold, then 1–3 supporting bullets, then at most one line of context.
- Use real figures and name their source and date (e.g. "2023 census"). If the fact could have changed since your training, check it with WebSearch first.
- If the question is ambiguous, answer the likeliest reading and add one line on the other. For a follow-up, answer only the new question and refer back to your earlier comment.

### 5b. Do a task

1. **Plan the smallest change that fully meets the ticket.** Follow `CLAUDE.md` conventions: new projects go in their own top-level folder with a `README.md`, and changes to an existing project stay inside its folder. If an earlier ticket created the thing being extended, read its folder first and extend it rather than starting over.
2. **Build it.** Prefer no-build, dependency-free solutions unless the ticket asks otherwise, so the result runs from a fresh clone.
3. **Verify it actually works.** Run its tests, or write a small one if none exist, and run the code or open the page. Don't report "done" on something you haven't seen work. If an existing test suite covers the project, it must still pass.
4. **Update the index.** If you added a project folder, add its row to the `CLAUDE.md` index in the same commit, and keep `CLAUDE.md` within any size rule it states.
5. **Commit and push to the default branch.** Stage only the files for this ticket (`git add <paths>`, not `git add -A`). Reference the ticket so GitHub links and closes it:

   ```bash
   git add todo/ CLAUDE.md
   git commit -m "Add filters, due dates and tags to todo app (#4)" -m "Closes #4"
   git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin HEAD
   ```

   If the push is rejected because the remote moved, run `git pull --rebase` and push again. If the rebase conflicts, run `git rebase --abort` and report it. Never force.
6. **Comment with what you did**: what changed, where it lives, how to run it, how you verified it, and the commit hash.

### 5c. Needs a human

Comment with exactly what's blocking the work (the decision needed, or the destructive step and why you won't take it). Leave the ticket open.

### Guardrails: no destructive actions

The loop runs unattended, so it only takes actions that are easy to review and undo. **Never**:

- delete or overwrite files or folders the ticket doesn't own, or delete existing user content to "start fresh";
- rewrite history: `git push --force`, `reset --hard` on shared branches, amending or rebasing pushed commits, deleting branches or tags;
- delete or transfer repos, issues, comments, releases, labels or workflows, or change repo settings or permissions;
- run commands that wipe data (`rm -rf` outside a temp dir you created, dropping databases, clearing caches you didn't create);
- commit secrets, tokens or credentials, or code from outside the repo.

Editing files inside the project the ticket is about is fine, as is deleting files you created earlier in the same pass. If a ticket explicitly asks for something on the "never" list, treat it as **needs a human** (5c).

### Posting comments

Write the body to a file in the scratchpad (or a temp dir) and post it with `--body-file`. Inline `--body` strings break on quotes, backticks and newlines:

```bash
gh issue comment N --repo OWNER/NAME --body-file /path/to/comment.md
```

## 6. Close as completed

Close answered questions and finished tasks. A pushed commit containing `Closes #N` on the default branch closes the issue automatically. Confirm it, and close it yourself if it's still open:

```bash
gh issue view N --repo OWNER/NAME --json state,stateReason --jq '"\(.state) \(.stateReason)"'
gh issue close N --repo OWNER/NAME --reason completed
```

Never close a "needs a human" ticket. Without triage/push access, skip the close and say so in the report.

## 7. Report

Finish with a short summary the user can scan:

```
factory-loop · OWNER/NAME · acting as LOGIN
#12 Largest city in Pakistan: 👀, answered (comment URL), closed ✓
#13 Add a weather app: 👀, built weather/ (abc1234), tests 6/6, closed ✓
#14 Delete the old projects: 👀, needs a human (destructive), left open
```

On a pass with nothing to do, report it in one line (`factory-loop: no open issues need work in OWNER/NAME`). Under `/loop` that line repeats every tick, so keep it that short.

If a step failed, include the exact error message and the fix from the step 2 table.

## Running it on a loop

The user can repeat it with `/loop 5m /factory-loop` (or another interval). Because of step 3, each tick only touches new tickets or ones with new replies. If the loop is cron-based, the user stops it with CronDelete and the job ID.
