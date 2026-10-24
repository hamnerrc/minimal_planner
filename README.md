# Planner Dashboard

A personal deadline and daily-routine dashboard. Open `dashboard.html` in any
browser (double-click it). No install, no server, no internet needed.

Everything you enter is saved in your browser's local storage, on this computer
only. Use **Settings → Download backup** to keep a copy or move it to another browser.

## Layout

```
dashboard.html            the page you open
assets/css/dashboard.css  all styling (light + dark mode)
assets/js/dates.js        date helpers
assets/js/schedule.js     daily shuffle + rotating work schedule (ported from the spreadsheet)
assets/js/store.js        saving/loading in localStorage, backup/restore
assets/js/app.js          draws the panels and handles clicks
reference/todo_framework.xlsx   the original spreadsheet framework
info.txt                  open questions for future development
```

## How it maps to the original spreadsheet

| Spreadsheet         | Dashboard |
|---------------------|-----------|
| `rn` sheet (index into the sorted list) | **Right now** card: shows the next unfinished daily, with Done / Skip |
| `rn` "sort of a dashboard" (category + due date) | **Deadlines** panel: one column per category, color-coded by urgency |
| `todo` sheet (time, task, rank, shuffled order) | **Today's dailies**: same rank rule (1–9 priority, 10+ optional) and the same date-seeded shuffle formula |
| `todo` "important non quest" | **Important, not daily** checklist |
| `week` sheet (14 days, rotation, due/event, plan, time slots, work block) | **Planner** at the bottom |

## What's new compared with the spreadsheet

- Check off dailies; progress and time remaining update live; streaks (🔥) per daily
- Deadlines get urgency colors (overdue, ≤2 days, due soon), countdowns, notes, and a done state
- Deadlines and events show up on their day in the planner automatically
- Planner shows "Work on: …" under days leading up to a deadline
- The work rotation is calculated, not typed. Mark a day off and the rotation pauses
- Categories, work hours, work days, and the rotation cycle are all editable in Settings
- Dark mode follows your system setting; the layout works on a phone
