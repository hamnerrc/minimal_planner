// The backend. Decides which tasks happen today and in what order, keeps that
// queue stable for the whole day, and records progress separately from it.
//
// Rules:
//  - A day's queue is generated once (the first time the page is opened that
//    day) and saved. Clicking Done never reorders it.
//  - If tasks are added mid-day they join the END of today's queue; deleted
//    or no-longer-available tasks drop out. Priority changes apply tomorrow.
//  - Rank is just the task's place in your list (task.order). Tasks below the
//    "if there's time" line (task.optional) are optional.
//  - Must-do tasks go in exactly the order you put them. Optional tasks come
//    after, in a different order each day (seeded by the date and the name).
//  - Tasks with a due date climb one place per day as the date gets close;
//    an optional task with a due date that close becomes a must-do.
//  - Optional tasks are only queued while they fit in the day's time budget.
//  - Time windows don't reorder anything; they only
//    decide whether the next queued task can be shown right now.
const Engine = (() => {
  const minutes = (t) => Math.max(0, Number(t.minutes) || 0);
  const roundUp5 = (m) => Math.ceil(m / 5) * 5;

  // ---------------------------------------------------------------- spreading work
  // A one-time task can have a total amount of work (task.total, minutes).
  // It's split over the days left before the due date, recalculated every day
  // from what's actually been done, so a missed day just makes later days a
  // bit longer. task.perDay overrides the automatic daily amount.
  const isSpread = (t) => t.kind === 'once' && Number(t.total) > 0;
  const ONE_SITTING = 60;   // up to this much is done in one go
  const MIN_SESSION = 30;   // longer work is never cut into smaller pieces than this
  const NO_DUE_SESSION = 60; // daily amount when there's no due date

  function canWorkOn(task, date) {
    return task.days.includes(Dates.weekday(date)) && (!task.start || date >= task.start);
  }

  function workedBefore(state, task, date) {
    let m = 0;
    for (const [d, p] of Object.entries(state.progress)) {
      if (d < date && p.done && p.done[task.id]) m += Number(p.done[task.id].minutes) || 0;
    }
    return m;
  }

  // How the remaining work splits up, as of `date`.
  function split(state, task, date) {
    const total = Math.max(0, Number(task.total) || 0);
    const worked = workedBefore(state, task, date);
    const remaining = Math.max(0, total - worked);
    let daysLeft = null;
    if (task.due) {
      daysLeft = 0;
      for (let d = date; d <= task.due && daysLeft < 1000; d = Dates.addDays(d, 1)) if (canWorkOn(task, d)) daysLeft++;
    }
    let auto;
    if (remaining <= ONE_SITTING) auto = remaining;
    else if (daysLeft == null) auto = NO_DUE_SESSION;
    else if (daysLeft <= 1) auto = remaining;
    else auto = Math.max(MIN_SESSION, roundUp5(remaining / daysLeft));
    const perDay = Number(task.perDay) > 0 ? Number(task.perDay) : auto;
    return { total, worked, remaining, daysLeft, auto, perDay, today: Math.min(remaining, perDay) };
  }

  // The days the work will land on from `date`: [{ date, minutes }].
  function sessions(state, task, date) {
    const { remaining, perDay } = split(state, task, date);
    const out = [];
    let left = remaining;
    for (let d = date, i = 0; left > 0 && perDay > 0 && i < 730; d = Dates.addDays(d, 1), i++) {
      if (!canWorkOn(task, d)) continue;
      const m = Math.min(left, perDay);
      out.push({ date: d, minutes: m });
      left -= m;
    }
    return out;
  }

  // Minutes this task takes on `date`.
  function sessionMinutes(state, task, date) {
    return isSpread(task) ? split(state, task, date).today : minutes(task);
  }

  // ---------------------------------------------------------------- calendar
  function isWorkDay(date, s) {
    return s.workDays.includes(Dates.weekday(date)) && !s.offDays.includes(date);
  }

  // ---------------------------------------------------------------- queue building
  // Fractional part of |sin(seed)|: a stable pseudo-random number in [0, 1)
  // that changes every day and differs per task name (same as the sheet).
  function jitter(name, serial) {
    let codes = 0;
    for (const ch of name) codes += ch.charCodeAt(0);
    const x = Math.abs(Math.sin((serial * 1000 + codes) * 12345.6789));
    return x - Math.floor(x);
  }

  function isAvailableOn(task, date, s) {
    if (task.start && date < task.start) return false;
    if (task.kind === 'once') {
      if (task.doneOn && task.doneOn < date) return false;
    } else if (task.due && date > task.due) {
      return false;
    }
    if (!task.days.includes(Dates.weekday(date))) return false;
    return true;
  }

  // Your list, top first: must-do tasks, then the ones below the line.
  const byOrder = (a, b) => (Number(!!a.optional) - Number(!!b.optional)) || (a.order - b.order);

  // Each must-do task's place in the list, 1 = top.
  function places(state) {
    const must = state.tasks.filter((t) => !t.optional).sort(byOrder);
    return { at: new Map(must.map((t, i) => [t.id, i + 1])), count: must.length };
  }

  // Lower = sooner. Each day inside the "due soon" window moves it up one.
  function effectiveRank(task, date, s, pl) {
    const boost = task.due ? Math.max(0, s.soonDays - Dates.diffDays(date, task.due)) : 0;
    const must = !task.optional || boost > 0;
    const base = task.optional ? pl.count + 1 : pl.at.get(task.id);
    return { must, rank: base - boost };
  }

  // Full ordered plan for a date, with the reasoning attached (used by the
  // Configuration preview so you can see why things landed where they did).
  function plan(state, date) {
    const s = state.settings;
    const serial = Dates.excelSerial(date);
    const pl = places(state);
    const scored = state.tasks
      .filter((t) => isAvailableOn(t, date, s))
      .map((t) => ({ task: t, ...effectiveRank(t, date, s, pl), j: jitter(t.name, serial) }));

    const priority = scored.filter((x) => x.must).sort((a, b) => a.rank - b.rank || a.task.order - b.task.order);
    const optional = scored.filter((x) => !x.must).sort((a, b) => a.j - b.j || a.task.id.localeCompare(b.task.id));
    const ordered = [...priority, ...optional];
    const budget = isWorkDay(date, s) ? s.budgetWork : s.budgetOff;
    const mins = (t) => sessionMinutes(state, t, date);
    let left = budget - priority.reduce((m, x) => m + mins(x.task), 0);
    for (const x of ordered) {
      if (x.must) x.included = true;
      else if (mins(x.task) <= left) { x.included = true; left -= mins(x.task); }
      else x.included = false;
    }
    return { items: ordered, budget };
  }

  function progressFor(state, date) {
    state.progress[date] = state.progress[date] || { shown: {}, done: {} };
    return state.progress[date];
  }

  // Make sure today's queue exists and matches the task list. Returns true if
  // anything changed (so the caller knows to save).
  function ensureQueue(state, date) {
    const fresh = plan(state, date).items.filter((x) => x.included).map((x) => x.task.id);
    const q = state.queues[date];
    if (!q) {
      state.queues[date] = { ids: fresh, at: Date.now() };
      return true;
    }
    const done = progressFor(state, date).done;
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    const keep = q.ids.filter((id) => done[id] || (byId.has(id) && isAvailableOn(byId.get(id), date, state.settings)));
    const ids = [...keep, ...fresh.filter((id) => !keep.includes(id))];
    if (ids.join() === q.ids.join()) return false;
    q.ids = ids;
    return true;
  }

  // You reordered the list: today's not-done tasks follow the new order
  // right away. What's already done stays where it was.
  function reorderToday(state, date) {
    const q = state.queues[date];
    if (!q) return;
    const done = progressFor(state, date).done;
    const fresh = plan(state, date).items.filter((x) => x.included).map((x) => x.task.id);
    q.ids = [...q.ids.filter((id) => done[id]), ...fresh.filter((id) => !done[id])];
  }

  // ---------------------------------------------------------------- right now
  // Can this task be done at minute-of-day `now`? 'open', 'later' (with the
  // minute it opens) or 'closed' for the rest of today.
  function windowState(task, date, now, s) {
    const from = task.from ? Dates.toMinutes(task.from) : 0;
    const to = task.to ? Dates.toMinutes(task.to) : 24 * 60;
    const t = Math.max(now, from);
    if (t >= to) return { state: 'closed' };
    return t === now ? { state: 'open' } : { state: 'later', at: t };
  }

  // The one thing to show: { task } | { waitUntil: minute } | { finished: true }
  function next(state, date, now) {
    const q = state.queues[date];
    const done = progressFor(state, date).done;
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    let wait = null;
    for (const id of q ? q.ids : []) {
      const task = byId.get(id);
      if (!task || done[id]) continue;
      const w = windowState(task, date, now, state.settings);
      if (w.state === 'open') return { task };
      if (w.state === 'later') wait = wait == null ? w.at : Math.min(wait, w.at);
    }
    return wait == null ? { finished: true } : { waitUntil: wait };
  }

  // Remember when a task first appeared, to measure how long it took.
  function markShown(state, date, id) {
    const p = progressFor(state, date);
    if (p.shown[id]) return false;
    p.shown[id] = Date.now();
    return true;
  }

  function complete(state, date, task) {
    const p = progressFor(state, date);
    // name/minutes are copied so history survives the task being edited or deleted
    const m = sessionMinutes(state, task, date);
    p.done[task.id] = { at: Date.now(), shown: p.shown[task.id] || null, name: task.name, minutes: m };
    if (task.kind !== 'once') return;
    if (!isSpread(task) || workedBefore(state, task, date) + m >= Number(task.total)) task.doneOn = date;
  }

  // "It's all done", even if the plan had more sessions left.
  function finish(state, date, task) {
    const p = progressFor(state, date);
    if (!p.done[task.id]) {
      const m = isSpread(task) ? split(state, task, date).remaining : minutes(task);
      p.done[task.id] = { at: Date.now(), shown: p.shown[task.id] || null, name: task.name, minutes: m };
    }
    task.doneOn = date;
  }

  function undo(state, date, task) {
    delete progressFor(state, date).done[task.id];
    if (task.kind === 'once' && task.doneOn === date) delete task.doneOn;
  }

  // Minutes from appearing on screen to Done. Ignored past 4h (page left open).
  function actualMinutes(entry) {
    if (!entry.shown) return null;
    const m = (entry.at - entry.shown) / 60000;
    return m >= 0 && m <= 240 ? m : null;
  }

  return {
    isWorkDay, isAvailableOn, byOrder, plan, ensureQueue, reorderToday,
    windowState, next, markShown, complete, finish, undo,
    isSpread, split, sessions, sessionMinutes, workedBefore, actualMinutes, progressFor,
  };
})();
