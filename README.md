# Planner

Complexity in the backend, simplicity at the point of action.

Open `dashboard.html` in a browser (double-click it). No install, no server.
Everything is saved in this browser's local storage, on this computer only.

## Tabs

- **RN**: the one task to do right now and a **Done** button. Nothing else.
- **Configuration**: add/remove tasks; set priority, duration, and availability;
  the work schedule; a "How the queue is built" view for checking the engine.
- **Meta**: tasks done per day, completion rate, time per task vs. estimate.

## How the queue works (`assets/js/engine.js`)

1. The first time the page opens each day, it builds **today's queue** and saves it.
2. Pressing Done records progress **separately** from the queue. Nothing is ever
   reshuffled by clicking.
3. Order is the spreadsheet's date-seeded shuffle: priority 1–9 stays near its
   rank (±1.5), and 10+ (optional) lands at random. The same day always gives the same order.
4. Due dates boost priority as they approach (1 rank per day inside the "due soon" window).
5. Availability filters what can be queued on a given day: weekdays, start date,
   end/due date, and rotation periods.
6. Optional tasks are only queued while the day's total minutes fit the time budget.
7. Time windows ("not before / not after", "not during work hours") don't
   reorder the queue. They only decide whether the next task can be shown now.
   If it can't, RN shows the next open one, or "Nothing right now".
8. Mid-day edits: new tasks join the end of today's queue, and deleted ones drop out.
   Priority changes take effect tomorrow.

## Files

```
dashboard.html               the page you open
assets/css/dashboard.css     styling (light + dark)
assets/js/dates.js           date helpers
assets/js/dom.js             tiny element-building helper
assets/js/store.js           localStorage, data shape, backup/restore, migration
assets/js/engine.js          queue building, availability, rotation, progress
assets/js/views/rn.js        RN tab
assets/js/views/config.js    Configuration tab
assets/js/views/meta.js      Meta tab
assets/js/app.js             tab switching, timers, wiring
reference/todo_framework.xlsx  the original spreadsheet framework
info.txt                     open questions for future development
```

## Data

Stored under the localStorage key `planner-dashboard-v2`. Data from the first
version (`planner-dashboard-v1`) is brought over automatically the first time
and left in place. Configuration → Your data has backup download/restore.
