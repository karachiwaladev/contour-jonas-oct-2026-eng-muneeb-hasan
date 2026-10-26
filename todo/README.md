# Todo app

A simple todo list that runs entirely in the browser. Built for [Ticket #3](https://github.com/karachiwaladev/contour-jonas-oct-2026-eng-muneeb-hasan/issues/3).

## Features

- Create a task
- Mark a task done (or not done)
- Delete a task
- Tasks persist across reloads in a client-side database (IndexedDB)

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
| `index.html` | Page markup |
| `styles.css` | Styles, with light and dark themes |
| `app.js` | UI: renders tasks and handles add, toggle and delete |
| `db.js` | IndexedDB wrapper (`todo-app` database, `tasks` store) |
| `test.html` | Browser test: open http://localhost:8000/test.html. It **wipes the `todo-app` database**, drives the UI and prints PASS/FAIL per check |

## Data model

Each task is `{ id, title, done, createdAt }`. `id` is auto-incremented by IndexedDB, and tasks are listed oldest first by `createdAt`. To add fields (due dates, tags), add them on create in `db.js` and bump `DB_VERSION` only if you need new indexes.
