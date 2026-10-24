// Everything is kept in this browser's localStorage, on this computer only.
//
// Saved shape:
//   tasks     what you configured (name, priority, minutes, availability)
//   settings  work schedule, rotation, daily budget
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
      priority: 5,      // 1–9 priority, 10+ optional
      minutes: 15,
      days: [...ALL_DAYS],
      from: '',         // earliest time of day, 'HH:MM' or ''
      to: '',           // latest time of day
      avoidWork: false, // not during work hours on work days
      periods: [],      // only on these rotation periods (empty = any)
      start: '',        // not before this date
      due: '',          // once: due date; repeat: last day it repeats
      notes: '',
      ...fields,
    };
  }

  function defaultSettings() {
    return {
      rotationAnchor: Dates.today(),
      anchorPeriod: 1,
      cycleLength: 8,
      workDays: [1, 2, 3, 4, 5],
      offDays: [],
      workStart: '08:00',
      workEnd: '15:30',
      budgetWork: 120,  // total task minutes on a work day; optional tasks only fill what's left
      budgetOff: 240,   // ...and on a day off
      soonDays: 7,      // due dates start boosting priority this many days out
    };
  }

  function defaults() {
    const today = Dates.today();
    return {
      version: 2,
      tasks: [
        task({ name: 'Thing to do every day', priority: 1, minutes: 20 }),
        task({ name: 'Another thing to do every day', priority: 2, minutes: 30 }),
        task({ name: 'Language practice: learn the next tense', priority: 3, minutes: 15 }),
        task({ name: 'Next thing due at work', kind: 'once', priority: 5, minutes: 30, due: Dates.addDays(today, 3) }),
        task({ name: 'Read for fun', priority: 10, minutes: 20, from: '18:00' }),
      ],
      settings: defaultSettings(),
      queues: {},
      progress: {},
    };
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
  function normalize(data) {
    return {
      version: 2,
      tasks: (Array.isArray(data.tasks) ? data.tasks : []).map((t) => task(t)),
      settings: { ...defaultSettings(), ...(data.settings || {}) },
      queues: data.queues && typeof data.queues === 'object' ? data.queues : {},
      progress: data.progress && typeof data.progress === 'object' ? data.progress : {},
    };
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

  return { uid, task, defaults, load, save, download, restore, clear, ALL_DAYS };
})();
