// The backend. Decides which tasks happen today and in what order, keeps that
// queue stable for the whole day, and records progress separately from it.
//
// Rules:
//  - A day's queue is generated once (the first time the page is opened that
//    day) and saved. Clicking Done never reorders it.
//  - If tasks are added mid-day they join the END of today's queue; deleted
//    or no-longer-available tasks drop out. Priority changes apply tomorrow.
//  - Order uses the spreadsheet's date-seeded shuffle: priority tasks (rank
//    under 10) stay near their rank ±1.5, optional tasks (10+) land randomly.
//  - Tasks with a due date climb in priority as the date gets close.
//  - Optional tasks are only queued while they fit in the day's time budget.
//  - Time windows and "not during work" don't reorder anything; they only
//    decide whether the next queued task can be shown right now.
const Engine = (() => {
  const minutes = (t) => Math.max(0, Number(t.minutes) || 0);

  // ---------------------------------------------------------------- calendar
  function isWorkDay(date, s) {
    return s.workDays.includes(Dates.weekday(date)) && !s.offDays.includes(date);
  }

  // Which period of the rotation a date falls on. The rotation only moves
  // forward on work days, so weekends and days off don't use up a period.
  function rotation(date, s) {
    if (!isWorkDay(date, s)) return null;
    const span = Dates.diffDays(s.rotationAnchor, date);
    let n = 0;
    if (span >= 0) {
      // work days in (anchor, date]
      for (let i = 1; i <= span; i++) if (isWorkDay(Dates.addDays(s.rotationAnchor, i), s)) n++;
    } else {
      // work days in [date, anchor)
      for (let i = 0; i < -span; i++) if (isWorkDay(Dates.addDays(date, i), s)) n--;
    }
    const len = Math.max(1, s.cycleLength);
    return ((((s.anchorPeriod - 1 + n) % len) + len) % len) + 1;
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
    if (task.periods.length) {
      const p = rotation(date, s);
      if (!p || !task.periods.includes(p)) return false;
    }
    return true;
  }

  // Lower = sooner. Each day inside the "due soon" window moves it up one.
  function effectiveRank(task, date, s) {
    let rank = Number(task.priority) || 10;
    if (task.due) rank -= Math.max(0, s.soonDays - Dates.diffDays(date, task.due));
    return rank;
  }

  // Full ordered plan for a date, with the reasoning attached (used by the
  // Configuration preview so you can see why things landed where they did).
  function plan(state, date) {
    const s = state.settings;
    const serial = Dates.excelSerial(date);
    const scored = state.tasks
      .filter((t) => isAvailableOn(t, date, s))
      .map((t) => ({ task: t, rank: effectiveRank(t, date, s), j: jitter(t.name, serial) }));

    const priority = scored.filter((x) => x.rank < 10);
    priority.forEach((x) => { x.score = x.rank + (x.j - 0.5) * 3; });
    const scores = priority.map((x) => x.score);
    const lo = scores.length ? Math.min(...scores) - 1 : 0;
    const hi = scores.length ? Math.max(...scores) + 1 : 10;
    const optional = scored.filter((x) => x.rank >= 10);
    optional.forEach((x) => { x.score = lo + x.j * (hi - lo); });

    const ordered = [...priority, ...optional].sort((a, b) => a.score - b.score || a.task.id.localeCompare(b.task.id));
    const budget = isWorkDay(date, s) ? s.budgetWork : s.budgetOff;
    let left = budget - priority.reduce((m, x) => m + minutes(x.task), 0);
    for (const x of ordered) {
      if (x.rank < 10) x.included = true;
      else if (minutes(x.task) <= left) { x.included = true; left -= minutes(x.task); }
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

  // ---------------------------------------------------------------- right now
  // Can this task be done at minute-of-day `now`? 'open', 'later' (with the
  // minute it opens) or 'closed' for the rest of today.
  function windowState(task, date, now, s) {
    const from = task.from ? Dates.toMinutes(task.from) : 0;
    const to = task.to ? Dates.toMinutes(task.to) : 24 * 60;
    let t = Math.max(now, from);
    if (task.avoidWork && isWorkDay(date, s)) {
      const ws = Dates.toMinutes(s.workStart);
      const we = Dates.toMinutes(s.workEnd);
      if (t >= ws && t < we) t = we;
    }
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
    p.done[task.id] = { at: Date.now(), shown: p.shown[task.id] || null, name: task.name, minutes: minutes(task) };
    if (task.kind === 'once') task.doneOn = date;
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
    isWorkDay, rotation, isAvailableOn, effectiveRank, plan, ensureQueue,
    windowState, next, markShown, complete, undo, actualMinutes, progressFor,
  };
})();
