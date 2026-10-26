# Software Factory

This repo is a **software factory**. Work arrives as GitHub issues (`Ticket #N`). An agent loop
picks each one up, does the work, and reports back on the ticket. We improve the factory (the loop,
skills and conventions) rather than hand-building features.

## How work flows

1. A ticket is opened as an issue on this repo.
2. The `factory-loop` skill (run with `/loop 1m /factory-loop`) reacts 👀 to acknowledge it.
3. Questions are answered in a comment and the issue is closed as completed.
4. Build tasks go into the project's own folder (see [Projects](#projects)), get committed to
   `main`, and the issue is closed with a link to the commit.
5. Only what's on GitHub counts: push to `main`.

## Progressive disclosure

Keep context small and load detail only when it's needed:

- **This file is the index.** It says what exists and where. It doesn't say how each piece works.
- **Each project folder has its own `README.md`** with its purpose, how to run it and its
  decisions. Read it only when you're working in that project.
- **Skills live in `.claude/skills/<name>/SKILL.md`** and load only when their task comes up.
- Before adding detail here, ask: does every task need this? If not, put it in the project folder.

## Rules for this file

- **Stay under 100 lines, always.** If an edit would push it over, move detail into a project's
  `README.md` and leave a one-line pointer here.
- **Update the index in the same commit** that adds, renames or removes a project folder.
- One row per project, with a one-line description. No deeper detail.

## Project conventions

- Every project lives in its **own top-level folder** (`todo/`, `weather/`, …). Never put project
  files at the repo root.
- Each folder has a `README.md` (purpose, how to run, the ticket that created it).
- Projects are self-contained: no imports across project folders.
- Commit messages reference the ticket, e.g. `Add todo app (#3)`.

## Index

### Factory

| Path | What it is |
|---|---|
| `CLAUDE.md` | This index and the factory rules |
| `.claude/skills/factory-loop/` | Skill that triages, answers and closes ticket issues |
| `.claude/settings.json` | Project hooks: a Stop hook runs `.claude/hooks/log-prompts.py` |
| `.claude/prompts.jsonl` | Log of typed prompts (one JSON object per line), appended on every stop |
| `README.md` | Workshop instructions and scoring (not factory docs) |

### Projects

| Folder | Ticket | Description |
|---|---|---|
| _none yet_ | | |

## Ground rules

- Training repo only: no Jonas or Contour code and no real keys or secrets.
- Run commands from the repo root and pass `--repo` to `gh`.
