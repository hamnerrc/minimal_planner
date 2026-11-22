# Planner

Complexity in the backend, simplicity at the point of action.

Open `dashboard.html` in a browser (double-click it). No install, no server.
Everything is saved in this browser's local storage, on this computer only.

## Tabs

- **RN**: the one task to do right now and a **Done** button. Nothing else.
  Done has focus, so Enter or Space finishes the task.
- **Configuration**: type or paste things into the box at the top (one per line)
  to add them. The list is the order things happen: top goes first. Drag the ⠿
  handle (or focus it and use the arrow keys) to move a task. Anything below the
  "If there's time" line is optional. There are no priority numbers.
  The "New tasks" switches under the box choose whether they're
  one-time or every day, and which time window they get, so a batch of daily
  tasks needs no editing. Click a task to give it a due date on the calendar and
  say how much work it is in total. The planner splits that over the days before
  it's due and shades those days on the calendar. Time of day is on the main
  form; repeating, start date and notes are under "More". Click outside the editor to cancel, Cmd/Ctrl+Enter to save.
  Time windows, days off, work schedule, daily limits and backup are folded below
  the list, and folds you leave open stay open next time.
- **Time windows**: saved windows such as "Daytime, 8:00 am–8:00 pm" (built in).
  "Add to all N any-time tasks" puts one on every task without a time in one
  click (with Undo). Tasks stay linked: change a window's times and every task
  using it changes too. In the editor, "Custom" times can be saved as a new window.

## How the queue works (`assets/js/engine.js`)

1. The first time the page opens each day, it builds **today's queue** and saves it.
2. Pressing Done records progress **separately** from the queue. Nothing is ever
   reshuffled by clicking.
3. Tasks above the line go in exactly your list order. Tasks below it come after,
   in a different order each day (seeded by the date, so a day never reshuffles).
4. Due dates move a task up one place per day inside the last 7 days. An optional
   task due that soon becomes a must-do.
5. Availability filters what can be queued on a given day: weekdays, start date,
   and end/due date.
6. Optional tasks are only queued while the day's total minutes fit the time budget.
7. Time windows ("not before / not after") don't
   reorder the queue. They only decide whether the next task can be shown now.
   If it can't, RN shows the next open one, or "Nothing right now".
8. Big one-time tasks: give a total amount of work and it's spread over the days
   left before the due date (never in pieces under 30 min; an hour or less is done
   in one go; no due date = an hour a day). It's recalculated each day from what's
   actually been done, so a missed day makes the later days a little longer.
   Done on RN finishes today's share; "Finished the whole thing" ends it early.
9. Mid-day edits: new tasks join the end of today's queue, and deleted ones drop out.
   Moving tasks in the list re-orders what's left of today right away.

## Files

```
dashboard.html               the page you open
assets/css/dashboard.css     styling (light + dark)
assets/js/dates.js           date helpers
assets/js/dom.js             tiny element-building helper
assets/js/store.js           localStorage, data shape, backup/restore, migration
assets/js/engine.js          queue building, availability, progress
assets/js/views/rn.js        RN tab
assets/js/views/config.js    Configuration tab
assets/js/app.js             tab switching, timers, wiring
reference/todo_framework.xlsx  the original spreadsheet framework
info.txt                     open questions for future development
```

## Data

Stored under the localStorage key `planner-dashboard-v2`. Data from the first
version (`planner-dashboard-v1`) is brought over automatically the first time
and left in place. Configuration → Your data has backup download/restore.
