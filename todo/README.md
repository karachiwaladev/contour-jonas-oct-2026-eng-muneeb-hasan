# Todo app

A simple todo list that runs entirely in the browser. Built for [Ticket #3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3), extended in [Ticket #4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) and [Ticket #5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5).

## Features

- Create, complete and delete tasks
- **Due dates** (optional, date only). Incomplete tasks past their due date are highlighted as **Overdue**; due today is not overdue
- **Tags** (optional, comma-separated). Trimmed, lowercased and de-duplicated, shown as chips
- **Status filter:** All / Incomplete / Completed, with counts
- **Tag filter:** chips for every tag in use, one at a time, combined with the status filter. Clicking a tag on a task applies it
- **Edit** a task's title, due date and tags inline (Enter saves, Escape cancels)
- **Recurring tasks** (Daily / Weekly / Monthly / Yearly). Ticking one done keeps it as a completed task and creates the next occurrence with the same title, tags and repeat:
  - The next date is worked out from the due date and skipped forward to today or later, so an overdue series doesn't create a backlog.
  - Monthly and yearly dates past the end of a shorter month are clamped to its last day, then return to the original day (31 Jan → 28 Feb → 31 Mar).
  - A repeat with no due date starts today. Setting repeat to *Doesn't repeat* stops the series.
- Tasks persist in IndexedDB, and the selected filters persist in `localStorage`
- **Storage errors are shown, not swallowed.** If a save fails (storage blocked or full), a red message appears, the list keeps showing what is really saved, and whatever you typed stays in the form or editor so you can press Add or Save again. A failed tick puts the checkbox back.

![Overview](screenshots/issue-4-overview.png)

## Run it

ES modules don't load from `file://`, so serve the folder:

```bash
cd todo
python -m http.server 8000
```

Then open http://localhost:8000.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup: add form, filter bar, task list |
| `styles.css` | Styles, with light and dark themes |
| `app.js` | UI: rendering, filters, overdue logic, inline editing |
| `db.js` | IndexedDB wrapper (`todo-app` database, `tasks` store) |
| `recurrence.js` | Pure date maths for repeats: `nextDueDate(dueDate, repeat, today, anchorDay)` |
| `test.html` | Browser tests: open http://localhost:8000/test.html. They run the app as `index.html?ns=test`, which uses its own `todo-app-test` database and filters, so **your real tasks are not touched**. Prints PASS/FAIL per check |
| `eval/acceptance.html`, `eval/acceptance.js` | Acceptance eval for tickets #3–#5: open http://localhost:8000/eval/acceptance.html. One scenario per ticket requirement plus edge, failure and persistence cases, reported as pass / fail / skip / unclear. It also **wipes the `todo-app` database and saved filters** |
| `eval/REPORT.md` | Scenarios, decisions on unclear requirements, latest results (on `main` and PR #9) and remaining gaps |
| `coverage.mjs` | Runs `test.html` in headless Chrome and reports line and function coverage (see [Test coverage](#test-coverage)) |
| `screenshots/` | Screenshots from the in-browser check of each ticket |

## Test coverage

```bash
node todo/coverage.mjs
```

It needs Node 22+ and Chrome or Edge (set `CHROME_PATH` if they aren't in the usual place), and no packages. It serves the folder, runs `test.html` in headless Chrome with V8's coverage turned on, prints the test results and a table of line and function coverage for `app.js`, `db.js` and `recurrence.js`, and lists the lines that didn't run. It exits non-zero if a test fails. It uses its own temporary browser profile, so it doesn't touch your todo data. It can run in CI (with `CI` set it starts Chrome without its sandbox, which GitHub's Linux runners need), but no GitHub Actions workflow runs it yet: adding one needs a token with the `workflow` scope.

### How the tests are built

- **Independent cases.** Each test starts from an empty database and a freshly loaded page, and reports its checks on its own. One failing test can't hide or cause failures in another.
- **No fixed sleeps.** The app counts finished renders in `<body data-renders>`, and the tests wait for that count (or for a specific element) instead of pausing for a set time.
- **Saved, not just shown.** Add, edit, complete and delete are checked again after reopening the page, so a change that only appears on screen fails.
- **Storage failures.** The tests make IndexedDB fail (thrown errors, rejected writes and a database that can't be opened) and check the error message, the kept input, the retry, and that nothing was half-saved.

A line counts as covered if any of it ran. Lines where only part ran (e.g. the right side of `a || b` was never needed) are listed as "partly run".

## Data model

Each task is `{ id, title, done, createdAt, dueDate, tags, repeat, repeatDay, spawned }`:
- `id` is auto-incremented by IndexedDB, and tasks are listed oldest first by `createdAt`.
- `dueDate` is `"YYYY-MM-DD"` or `null`.
- `tags` is an array of lowercase strings.
- `repeat` is `"none" | "daily" | "weekly" | "monthly" | "yearly"`.
- `repeatDay` is the day of month the series is anchored to.
- `spawned` is set once an occurrence has created its next copy, so re-ticking it doesn't create a duplicate.

Tasks saved before #4/#5 lack the newer fields, and are read as `dueDate: null`, `tags: []`, `repeat: "none"`.

The filters are saved under `localStorage["todo-filters"]` as `{ status, tag }`. A saved tag that no longer exists is reset.

Opening the app with `?ns=<name>` uses the database `todo-app-<name>` and the filters key `todo-filters-<name>` instead. The tests use this to stay apart from real data.
