// Everything is kept in this browser's localStorage, on this computer only.
//
// Saved shape:
//   tasks     what you configured (name, place in the list, minutes, availability)
//   settings  work days, days off, daily budget
//   queues    { 'YYYY-MM-DD': { ids: [taskId...], at } }  the frozen order for each day
//   progress  { 'YYYY-MM-DD': { shown: {id: time}, done: {id: {at, shown, name, minutes}} } }
const Store = (() => {
  const KEY = 'planner-dashboard-v2';
  const OLD_KEY = 'planner-dashboard-v1'; // first version of the dashboard; read once, never deleted
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function task(fields) {
    return {
      id: uid(),
      name: '',
      kind: 'repeat',   // 'repeat' = every available day, 'once' = gone after it's done
      order: 0,         // place in your list; higher up goes first
      optional: false,  // below the "if there's time" line
      minutes: 15,      // repeating: each time. one-time without a total: the estimate
      total: 0,         // one-time: total work in minutes, spread over the days before it's due
      perDay: 0,        // one-time: your own daily amount (0 = work it out)
      days: [...ALL_DAYS],
      from: '',         // earliest time of day, 'HH:MM' or ''
      to: '',           // latest time of day
      window: '',       // id of a saved time window (settings.timePresets); keeps from/to in step with it
      start: '',        // not before this date
      due: '',          // once: due date; repeat: last day it repeats
      notes: '',
      ...fields,
    };
  }

  function defaultSettings() {
    return {
      workDays: [1, 2, 3, 4, 5],
      offDays: [],
      budgetWork: 120,  // total task minutes on a work day; optional tasks only fill what's left
      budgetOff: 240,   // ...and on a day off
      soonDays: 7,      // due dates start boosting priority this many days out
      // Saved time windows you can put on many tasks at once. Editing one
      // updates every task that uses it.
      timePresets: [{ id: 'daytime', name: 'Daytime', from: '08:00', to: '20:00' }],
      newKind: 'once',  // what the add box makes: 'once' or 'repeat' (every day)
      newWindow: '',    // time window id the add box puts on new tasks ('' = any time)
    };
  }

  // Copy each saved window's times onto the tasks that use it. A task whose
  // window was deleted keeps its times but is no longer linked.
  function syncWindows(state) {
    const s = state.settings;
    const byId = new Map(s.timePresets.map((p) => [p.id, p]));
    for (const t of state.tasks) {
      if (!t.window) continue;
      const p = byId.get(t.window);
      if (p) { t.from = p.from; t.to = p.to; } else t.window = '';
    }
    if (s.newWindow && !byId.has(s.newWindow)) s.newWindow = '';
    return state;
  }

  function defaults() {
    const today = Dates.today();
    return normalize({
      version: 2,
      tasks: [
        task({ name: 'Thing to do every day', order: 0, minutes: 20 }),
        task({ name: 'Another thing to do every day', order: 1, minutes: 30 }),
        task({ name: 'Language practice: learn the next tense', order: 2, minutes: 15 }),
        task({ name: 'Next thing due at work', kind: 'once', order: 3, minutes: 240, total: 240, due: Dates.addDays(today, 6) }),
        task({ name: 'Read for fun', order: 4, optional: true, minutes: 20, from: '18:00' }),
      ],
      settings: defaultSettings(),
      queues: {},
      progress: {},
    });
  }

  // Bring over data from the first version (dailies, open deadlines, the
  // important list, check-offs and schedule settings).
  function migrate(old) {
    const tasks = [];
    for (const d of old.dailies || []) {
      tasks.push(task({ id: d.id, name: d.name, priority: Number(d.rank) || 10, minutes: Number(d.minutes) || 0 }));
    }
    for (const d of old.deadlines || []) {
      if (d.done || d.kind === 'event') continue;
      tasks.push(task({ id: d.id, name: d.title, kind: 'once', priority: 5, minutes: 30, due: d.due || '', notes: d.notes || '' }));
    }
    for (const n of old.notes || []) {
      if (!n.done) tasks.push(task({ id: n.id, name: n.text, kind: 'once', priority: 10, minutes: 15 }));
    }
    const progress = {};
    for (const [date, ids] of Object.entries(old.dailyLog || {})) {
      const noon = Dates.parse(date).getTime() + 12 * 3600000;
      progress[date] = { shown: {}, done: {} };
      for (const id of ids) {
        const t = tasks.find((x) => x.id === id);
        if (t) progress[date].done[id] = { at: noon, shown: null, name: t.name, minutes: t.minutes };
      }
    }
    const settings = { ...defaultSettings() };
    for (const k of Object.keys(settings)) if (old.settings && k in old.settings) settings[k] = old.settings[k];
    return { version: 2, tasks, settings, queues: {}, progress };
  }

  // Fill in anything missing (e.g. a field added in a later version).
  // Settings that no longer exist (rotation periods, work hours) are dropped,
  // so older data can't quietly hide a task.
  const RETIRED_TASK = ['periods', 'avoidWork', 'priority'];
  const RETIRED_SETTINGS = ['rotationAnchor', 'anchorPeriod', 'cycleLength', 'workStart', 'workEnd'];
  const omit = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !keys.includes(k)));

  // Older data ranked tasks with numbers (1–9, 10+ = optional). Turn that
  // into a plain list order with the same tasks first.
  function fromNumbers(tasks) {
    if (!tasks.some((t) => 'priority' in t)) return tasks;
    const num = (t) => Number(t.priority) || 10;
    return [...tasks]
      .sort((a, b) => num(a) - num(b) || String(a.name).localeCompare(String(b.name)))
      .map((t, i) => ({ ...t, order: i, optional: t.optional ?? num(t) >= 10 }));
  }

  function normalize(data) {
    return syncWindows({
      version: 2,
      tasks: fromNumbers(Array.isArray(data.tasks) ? data.tasks : []).map((t) => task(omit(t, RETIRED_TASK))),
      settings: { ...defaultSettings(), ...omit(data.settings, RETIRED_SETTINGS) },
      queues: data.queues && typeof data.queues === 'object' ? data.queues : {},
      progress: data.progress && typeof data.progress === 'object' ? data.progress : {},
    });
  }

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function load() {
    const current = read(KEY);
    if (current) return normalize(current);
    const old = read(OLD_KEY);
    if (old) return normalize(migrate(old));
    return defaults();
  }

  let warned = false;
  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      if (!warned) alert('Your browser blocked saving, so changes will be lost when you close this page.');
      warned = true;
    }
  }

  function download(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planner-backup-${Dates.today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(file) {
    const data = JSON.parse(await file.text());
    return normalize(data.version === 2 ? data : migrate(data));
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (err) { /* nothing to clear */ }
  }

  return { uid, task, syncWindows, defaults, load, save, download, restore, clear, ALL_DAYS };
})();
