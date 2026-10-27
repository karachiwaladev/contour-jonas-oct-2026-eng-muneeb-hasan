# Todo acceptance eval: tickets #3–#5

An acceptance eval for the todo app. Each scenario comes from a requirement in ticket #3, #4 or #5, or from the plan agreed on that ticket (#4 and #5 settled their details through questions and an approved plan, so those defaults are the requirements). One scenario per requirement is the minimum, with edge and failure cases added.

## How to run it

```bash
cd todo
python -m http.server 8000
```

Then open http://localhost:8000/eval/acceptance.html. **It wipes the `todo-app` database and saved filters** in that browser profile, so use a separate profile or an incognito window. Run it in a fresh profile or incognito window, or after a hard reload, so the browser doesn't use stale cached copies of `app.js` and `recurrence.js`. The page shows a table and sets `window.__acceptance` to `{ summary, results, markdown }` for automation.

## How it works

- **It drives the real app.** `acceptance.html` loads `../index.html` in an iframe and uses the UI the way a person would: it types into the forms, submits them and clicks checkboxes, buttons and chips. It then checks what's shown, and reads IndexedDB directly to check what was stored.
- **Persistence** is checked after creating (3.2), editing (4.20), completing (3.4, 5.14) and deleting (3.7). A reload loads a fresh copy of the app against the same storage.
- **No fixed waits.** After each action it waits until the page shows what's stored: the counts, the tag chips, the pressed filters, and one row per visible task with the right title and done state. That expected state is worked out from the ticket requirements, not from the app's code. So it doubles as a check: if the app filters or renders wrongly, the wait times out and the scenario fails.
- **Expected dates are worked out independently** of the app's `recurrence.js`. The exception is 5.16, a logic-level check of leap-day and month-end maths with a fixed "today", which can't be controlled through the UI.
- **Four outcomes:**
  - **PASS / FAIL:** scored.
  - **SKIP:** can't be automated here; the reason is given.
  - **UNCLEAR:** the tickets don't define the expected behaviour. The eval records what the app does and flags it for a decision rather than guessing.

## Does the eval catch bugs?

I broke the app on purpose (temporarily, not committed) and reran the eval in a fresh browser context. The three bugs were:
- tags no longer lowercased;
- daily repeats stepping 2 days;
- tasks due today marked overdue.

It caught all three: 5 scenarios failed (4.7, 4.10, 4.20, 5.3, 5.7). With the app restored, it went back to 52 passed and 0 failed.

## Checked by hand: Enter key (4.24)

Synthetic key events don't submit forms, so I checked this in Chrome with real key presses through chrome-devtools. Pressing Enter in the add form added the task, and pressing Enter in the edit form saved the new title.

## Results
Run 2026-10-27T05:29:24Z in Chrome/154.0.0.0, 5.1 s.

**52 passed · 0 failed · 1 skipped · 4 unclear** (57 scenarios)

### Passed (52)

| ID | Ticket | Kind | Scenario | Detail |
|---|---|---|---|---|
| 3.1 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | requirement | Creating a task shows it in the list and stores it in IndexedDB |  |
| 3.2 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | persistence | A created task is still there after a reload |  |
| 3.3 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | requirement | Ticking a task marks it done |  |
| 3.4 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | persistence | Done state is still there after a reload |  |
| 3.5 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | edge | Unticking a done task makes it incomplete again (and it persists) |  |
| 3.6 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | requirement | Deleting a task removes only that task |  |
| 3.7 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | persistence | A deleted task stays deleted after a reload |  |
| 3.8 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | failure | A blank or whitespace-only title is not added |  |
| 3.9 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | failure | HTML in a title is shown as text, not run or rendered |  |
| 3.10 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | edge | Titles are trimmed, and long titles are kept in full |  |
| 3.11 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Everything runs client-side: no request leaves the page's origin | 4 requests, all to http://127.0.0.1:8765 (the app's own files) |
| 3.12 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | edge | The empty-state message shows with no tasks and comes back after the last delete |  |
| 4.1 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Completed filter shows only completed tasks |  |
| 4.2 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Incomplete filter shows only incomplete tasks |  |
| 4.3 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | All filter shows every task, with correct counts on each button |  |
| 4.4 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | persistence | The chosen status filter is remembered after a reload |  |
| 4.5 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | A task can have a due date, shown as a badge and stored as YYYY-MM-DD |  |
| 4.6 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | An incomplete task past its due date is highlighted as overdue |  |
| 4.7 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | edge | A task due today is not overdue |  |
| 4.8 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | edge | A completed task past its due date is not highlighted |  |
| 4.9 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | persistence | Due dates are still there after a reload |  |
| 4.10 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Tags are trimmed, lowercased and de-duplicated |  |
| 4.11 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | edge | A tags field of only commas and spaces gives no tags |  |
| 4.12 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | The tag filter row lists every tag in use, and hides when there are none |  |
| 4.13 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Clicking a tag shows only tasks with that tag; clicking it again clears the filter |  |
| 4.14 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | The tag filter combines with the status filter |  |
| 4.15 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Clicking a tag chip on a task applies that tag filter |  |
| 4.16 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | When filters hide every task, it says "No tasks match these filters." |  |
| 4.17 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | persistence | The chosen tag filter is remembered after a reload |  |
| 4.18 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | edge | A remembered tag filter is reset when no task has that tag any more |  |
| 4.19 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | failure | Corrupt or unknown saved filters fall back to All |  |
| 4.20 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Editing changes a task's title, due date and tags, and the change persists |  |
| 4.21 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | edge | Clearing the due date in the editor removes it |  |
| 4.22 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Escape and Cancel close the editor without saving |  |
| 4.23 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | failure | Saving an edit with a blank title is refused |  |
| 4.25 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | edge | A task saved before #4 (no due date or tags) still loads, filters and edits |  |
| 5.1 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | The add and edit forms both offer Doesn't repeat / Daily / Weekly / Monthly / Yearly |  |
| 5.2 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | A recurring task shows a ↻ badge naming its repeat |  |
| 5.3 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Ticking a daily task keeps it as completed and adds a copy due tomorrow |  |
| 5.4 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Ticking a weekly task adds a copy due in 7 days |  |
| 5.5 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Ticking a monthly task adds a copy due the same day next month (clamped) |  |
| 5.6 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Ticking a yearly task adds a copy due the same day next year (clamped) |  |
| 5.7 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | A long-overdue daily task creates one copy due today, not a backlog |  |
| 5.8 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | edge | Completing early keeps the schedule (next date counts from the due date, not today) |  |
| 5.9 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Choosing a repeat with no due date starts it today |  |
| 5.10 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | edge | Unticking and re-ticking creates no duplicate, and unticking keeps the copy |  |
| 5.11 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Setting repeat to Doesn't repeat stops the series |  |
| 5.12 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | Deleting a completed occurrence removes only that occurrence |  |
| 5.14 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | persistence | A completed occurrence, its new copy and the repeat are still there after a reload |  |
| 5.15 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | requirement | A monthly series on the 31st clamps to shorter months and returns to the 31st (through the UI) |  |
| 5.16 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | logic | Month-end and leap-day dates (date maths with a fixed today) |  |
| 5.17 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | edge | Tasks saved before #5 are non-recurring: no badge, and ticking adds no copy |  |

### Failed (0)

None.

### Skipped (1)

| ID | Ticket | Kind | Scenario | Detail |
|---|---|---|---|---|
| 4.24 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | requirement | Enter in the editor saves | Can't be automated in this page: synthetic key events don't trigger a form's implicit submission. Saving through the form's submit is covered by 4.20; a real Enter key press is checked separately (see REPORT.md). |

### Unclear requirements (flagged, not scored) (4)

| ID | Ticket | Kind | Scenario | Detail |
|---|---|---|---|---|
| 3.13 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | unclear | "A simple interface" has no measurable acceptance criteria | Ticket #3 asks for "a simple interface" without saying what counts as simple. Not scored; the screenshots in todo/screenshots show the UI for a human to judge. |
| 3.14 | [#3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3) | failure | Storage can't be opened (IndexedDB unavailable) | The tickets don't say what should happen. Observed: the task is not shown, no message is shown to the user, and the page raised 2 uncaught error(s) (first: "The requested version (1) is less than the existing version (2)."). PR #9 adds a visible storage-error message. |
| 4.26 | [#4](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/4) | unclear | Adding a task while a filter hides it | Not covered by #4's plan. Observed: the new task is saved but not shown while the Completed filter is on; only the counts change. Decide whether the filter should switch back to All or show a hint. |
| 5.13 | [#5](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/5) | unclear | Deleting the only open occurrence of a series | #5 says deleting "deletes only that occurrence", but not whether the series continues. Observed: 0 task(s) left, so deleting the open occurrence ends the series with no next copy. Confirm that's intended. |

## Unclear requirements (need a decision)

| ID | Question | What the app does now |
|---|---|---|
| 3.13 | What counts as "a simple interface" (#3)? | Not measurable. Judge from the screenshots in `todo/screenshots/`. |
| 3.14 | What should happen when storage can't be opened? | Nothing visible: the task isn't saved, there's no message, and the page throws uncaught errors. PR #9 adds a visible storage-error message. |
| 4.26 | Adding a task while a filter hides it: should the filter reset? | The task is saved but stays hidden; only the counts change. |
| 5.13 | Deleting the only open occurrence of a series: should the series continue? | It ends the series. No next copy is created. |

## Remaining gaps (not covered by this eval)

- **Real dates for month-end and leap days through the UI.** The app uses the real clock. 5.15 covers a 31st-anchored monthly series through the UI. Leap-day yearly repeats and "today is the 31st" can only be checked at the logic level (5.16).
- **Time zones and midnight.** All checks run in the browser's local time zone. Ticking a task across midnight, or in another zone, isn't covered.
- **Visual and accessibility checks.** Layout, the light and dark themes, contrast, screen-reader labels and mobile widths aren't scored.
- **Several tabs at once.** Two open copies of the app writing to the same database aren't covered.
- **Other browsers.** The eval was only run in Chrome.
- **Storage limits.** A full quota and private-mode storage limits aren't covered, beyond the "can't open" case in 3.14.
- **CI.** The eval isn't run in CI yet. PR #9 adds a workflow for `test.html`, and this page could be added to it once that workflow can be pushed.
