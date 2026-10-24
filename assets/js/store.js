// Everything you enter is kept in this browser's localStorage. Nothing is
// sent anywhere. Clearing site data for this file erases it, so use
// Settings -> Download backup now and then.
const Store = (() => {
  const KEY = 'planner-dashboard-v1';

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function defaults() {
    const today = Dates.today();
    const work = uid();
    const lang = uid();
    const hobby = uid();
    return {
      version: 1,
      categories: [
        { id: work, name: 'Work', color: '#2f6f9f' },
        { id: lang, name: 'Language learning', color: '#356854' },
        { id: hobby, name: 'Hobbies', color: '#a0522d' },
      ],
      // kind: 'deadline' (something due) or 'event' (something happening)
      deadlines: [
        { id: uid(), kind: 'deadline', title: 'Next thing due at work', categoryId: work, due: Dates.addDays(today, 3), notes: 'Sample — edit or delete me', done: false },
        { id: uid(), kind: 'deadline', title: 'Learn the next tense', categoryId: lang, due: Dates.addDays(today, 9), notes: 'Sample', done: false },
        { id: uid(), kind: 'event', title: 'Hobby meetup', categoryId: hobby, due: Dates.addDays(today, 5), notes: 'Sample', done: false },
      ],
      dailies: [
        { id: uid(), name: 'Thing to do every day', minutes: 20, rank: 1 },
        { id: uid(), name: 'Another thing to do every day', minutes: 30, rank: 2 },
        { id: uid(), name: 'Daily language practice', minutes: 15, rank: 3 },
        { id: uid(), name: 'Optional: read for fun', minutes: 20, rank: 10 },
      ],
      dailyLog: {},          // { 'YYYY-MM-DD': [dailyId, ...] } — what was checked off
      notes: [               // "important non quest" list
        { id: uid(), text: 'To-do 1', done: false },
        { id: uid(), text: 'To-do 2', done: false },
      ],
      plans: {},             // { 'YYYY-MM-DD': 'free text plan for that day' }
      blocks: {},            // { 'YYYY-MM-DD': { 'HH:MM': 'label' } } — planner time slots
      settings: {
        rotationAnchor: today,
        anchorPeriod: 1,
        cycleLength: 8,
        workDays: [1, 2, 3, 4, 5],
        offDays: [],
        workStart: '08:00',
        workEnd: '15:30',
        dayStart: '05:00',
        dayEnd: '23:00',
        soonDays: 7,
        plannerDays: 14,
      },
    };
  }

  // Fill in anything missing (e.g. a setting added in a later version).
  function normalize(data) {
    const base = defaults();
    const out = { ...base, ...data };
    out.settings = { ...base.settings, ...(data.settings || {}) };
    for (const key of ['categories', 'deadlines', 'dailies', 'notes']) {
      if (!Array.isArray(out[key])) out[key] = base[key];
    }
    for (const key of ['dailyLog', 'plans', 'blocks']) {
      if (!out[key] || typeof out[key] !== 'object') out[key] = {};
    }
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (err) {
      console.warn('Could not read saved data, starting fresh.', err);
    }
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
    return normalize(JSON.parse(await file.text()));
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (err) { /* nothing to clear */ }
  }

  return { uid, defaults, load, save, download, restore, clear };
})();
