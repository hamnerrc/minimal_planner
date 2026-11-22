// Configuration: dump tasks in, click one to give it a date and an amount of
// work. Everything else stays folded away.
const ConfigView = (() => {
  const { h, $ } = Dom;
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  // Folded sections that are open. Remembered across reloads so you don't
  // have to reopen the ones you use.
  const FOLDS_KEY = 'planner-open-folds';
  const openFolds = new Set((() => {
    try { return JSON.parse(localStorage.getItem(FOLDS_KEY)) || []; } catch (err) { return []; }
  })());
  const saveFolds = () => {
    try { localStorage.setItem(FOLDS_KEY, JSON.stringify([...openFolds])); } catch (err) { /* not remembered */ }
  };
  const calMonth = {};         // month each calendar is showing, 'YYYY-MM-01'
  let justAdded = new Set();   // ids from the last dump, highlighted in the list

  const LINE = '__line'; // the "if there's time" divider in the list
  const sortDays = (days) => [...days].sort((a, b) => a - b);
  const pad = (n) => String(n).padStart(2, '0');

  function dur(m) {
    m = Math.round(m);
    if (m < 60) return `${m} min`;
    return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
  }

  // One button in a segmented group. `k` lets focus survive a redraw.
  const opt = (label, on, onclick, k) => h('button', {
    type: 'button', class: on ? 'on' : '', 'aria-pressed': String(!!on), 'data-k': k, onclick,
  }, label);
  const seg = (...buttons) => h('div', { class: 'seg' }, buttons);
  const field = (label, ...body) => h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), body);

  // ---------------------------------------------------------------- calendar
  function calendar({ key, start, isOn, onPick, mark = () => '', min = '', redraw }) {
    const today = App.today;
    if (!calMonth[key]) calMonth[key] = `${(start || today).slice(0, 7)}-01`;
    const first = calMonth[key];
    const [y, m] = first.split('-').map(Number);
    const count = new Date(y, m, 0).getDate();
    const shift = (n) => () => {
      const d = new Date(y, m - 1 + n, 1);
      calMonth[key] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
      redraw();
    };
    const title = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const cells = [];
    for (let i = 0; i < Dates.weekday(first); i++) cells.push(h('span', {}));
    for (let i = 1; i <= count; i++) {
      const d = `${y}-${pad(m)}-${pad(i)}`;
      const on = isOn(d);
      cells.push(h('button', {
        type: 'button',
        class: [on && 'on', d === today && 'today', mark(d)].filter(Boolean).join(' '),
        disabled: !!(min && d < min),
        'aria-pressed': String(on), 'aria-label': Dates.long(d), 'data-k': `${key}-${d}`,
        onclick: () => onPick(d),
      }, String(i)));
    }
    return h('div', { class: 'cal' },
      h('div', { class: 'cal-head' },
        h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Previous month', 'data-k': `${key}-prev`, onclick: shift(-1) }, '‹'),
        h('span', {}, title),
        h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Next month', 'data-k': `${key}-next`, onclick: shift(1) }, '›')),
      h('div', { class: 'cal-grid' },
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => h('span', { class: 'cal-wd' }, d)),
        cells));
  }

  // ---------------------------------------------------------------- plain language
  function daysText(days) {
    const key = sortDays(days).join();
    if (key === '0,1,2,3,4,5,6') return 'Every day';
    if (key === '1,2,3,4,5') return 'Weekdays';
    if (key === '0,6') return 'Weekends';
    if (key === '') return 'No days picked';
    return sortDays(days).map((d) => Dates.WEEKDAYS[d]).join(', ');
  }

  const presets = () => App.state.settings.timePresets;
  const presetById = (id) => presets().find((p) => p.id === id);
  const presetOf = (t) => (t.window ? presetById(t.window) : null);
  // "Any time" tasks: no window of their own, so a saved window can go on them.
  const isAnyTime = (t) => !t.window && !t.from && !t.to;

  function timeText(from, to) {
    if (from && to) return `${Dates.clock(from)}–${Dates.clock(to)}`;
    if (from) return `after ${Dates.clock(from)}`;
    if (to) return `before ${Dates.clock(to)}`;
    return '';
  }

  function problem(t) {
    if (!t.days.length) return 'No days picked';
    if (t.kind === 'repeat' && t.due && t.due < App.today) return 'Ended';
    if (t.from && t.to && t.from >= t.to) return 'Time window is empty';
    return '';
  }

  // ---------------------------------------------------------------- page
  function render(root) {
    const { state } = App;
    const s = state.settings;
    const active = state.tasks.filter((t) => !(t.kind === 'once' && t.doneOn)).sort(Engine.byOrder);
    const finished = state.tasks.filter((t) => t.kind === 'once' && t.doneOn).sort((a, b) => b.doneOn.localeCompare(a.doneOn));

    root.append(
      h('section', { class: 'section' },
        dumpBox(),
        !active.length && h('p', { class: 'empty' }, 'Nothing here yet.'),
        active.length > 0 && taskList(active),
        finished.length > 0 && h('details', { class: 'finished' },
          h('summary', {}, `Finished (${finished.length})`),
          h('ul', { class: 'plain-list' }, finished.map((t) => h('li', {},
            h('span', {}, t.name, h('span', { class: 'muted' }, ` · ${Dates.short(t.doneOn)}`)),
            h('button', { class: 'link', onclick: () => { delete t.doneOn; App.commit(); } }, 'Bring back'),
            h('button', { class: 'link danger', onclick: () => removeTask(t) }, 'Delete')))))),
      windowsFold(s),
      todayFold(),
      offFold(s),
      tuningFold(s),
      dataFold(),
      undoBar() || '',
    );
  }

  // Type or paste; one task per line.
  function dumpBox() {
    const add = (text) => {
      const names = text.split('\n')
        .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
        .filter(Boolean);
      if (!names.length) return;
      const s = App.state.settings;
      const p = presetById(s.newWindow);
      let order = Math.max(-1, ...App.state.tasks.filter((t) => !t.optional).map((t) => t.order));
      const tasks = names.map((name) => Store.task({
        name, kind: s.newKind, order: ++order, window: p ? p.id : '', from: p ? p.from : '', to: p ? p.to : '',
      }));
      App.state.tasks.push(...tasks);
      justAdded = new Set(tasks.map((t) => t.id));
      App.commit();
    };
    const s = App.state.settings;
    const setNew = (key, v) => () => { s[key] = v; App.commit(); };
    const box = h('textarea', {
      rows: 1, 'data-k': 'dump', 'aria-label': 'Add tasks',
      placeholder: 'Add things to do. Enter adds; paste a list to add many.',
      oninput: (e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; },
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); add(e.target.value); }
      },
    });
    return h('div', { class: 'dump' },
      h('div', { class: 'dump-row' }, box, h('button', { class: 'btn', onclick: () => add(box.value) }, 'Add')),
      // Sticky choices for what the box makes, so a batch of daily tasks
      // needs no editing afterwards.
      h('div', { class: 'new-defaults' },
        h('span', { class: 'muted small' }, 'New tasks:'),
        seg(opt('One-time', s.newKind === 'once', setNew('newKind', 'once'), 'new-once'),
          opt('Every day', s.newKind === 'repeat', setNew('newKind', 'repeat'), 'new-repeat')),
        seg(opt('Any time', !s.newWindow, setNew('newWindow', ''), 'new-win-none'),
          presets().map((p) => opt(p.name, s.newWindow === p.id, setNew('newWindow', p.id), `new-win-${p.id}`)))),
      justAdded.size > 0 && h('p', { class: 'muted small' },
        `Added ${justAdded.size}.`, s.newKind === 'once' ? ' Click one to give it a due date and an amount of work.' : ''));
  }

  function whenText(t) {
    const today = App.today;
    const parts = [];
    let tone = '';
    if (t.kind === 'once') {
      if (t.due) {
        const n = Dates.diffDays(today, t.due);
        if (n < 0) { parts.push(`Overdue since ${Dates.short(t.due)}`); tone = 'danger'; }
        else parts.push(n <= 1 ? `Due ${Dates.friendly(t.due)}` : `Due ${Dates.weekdayName(t.due)} ${Dates.short(t.due)}`);
      } else {
        parts.push('No date');
      }
      if (Engine.isSpread(t) && Number(t.total) > 60) {
        parts.push(`${dur(Number(t.total))} total`);
      }
    } else {
      parts.push(daysText(t.days));
    }
    const p = presetOf(t);
    if (p) parts.push(p.name);
    else if (timeText(t.from, t.to)) parts.push(timeText(t.from, t.to));
    if (t.start && t.start > today) parts.push(`from ${Dates.short(t.start)}`);
    if (t.kind === 'repeat' && t.due && t.due >= today) parts.push(`until ${Dates.short(t.due)}`);
    return h('span', { class: `task-when ${tone}` }, parts.join(' · '));
  }

  // One list, top goes first. Drag the handle (or focus it and use the arrow
  // keys) to move a task; anything below the line is "if there's time".
  function taskList(tasks) {
    const { state, today } = App;
    const queued = new Set(state.queues[today]?.ids || []);
    const done = Engine.progressFor(state, today).done;
    const must = tasks.filter((t) => !t.optional);
    const optional = tasks.filter((t) => t.optional);

    const row = (t) => {
      const issue = problem(t);
      const status = issue ? h('span', { class: 'status danger' }, issue)
        : done[t.id] ? h('span', { class: 'status' }, 'done today')
          : queued.has(t.id) ? h('span', { class: 'status' }, 'today') : null;
      return h('li', { class: justAdded.has(t.id) ? 'is-new' : '', 'data-id': t.id },
        dragHandle(t.id, t.name),
        h('button', { class: 'task-row', onclick: () => openTask(t) },
          h('span', { class: 'task-main' }, h('span', { class: 'task-name' }, t.name), whenText(t)),
          status,
          h('span', { class: 'task-min' }, dur(Engine.sessionMinutes(state, t, today)))),
        h('button', { class: 'row-delete', title: 'Delete', 'aria-label': `Delete ${t.name}`, onclick: () => removeTask(t) }, '×'));
    };

    return h('ul', { class: 'task-list' },
      must.map(row),
      h('li', { class: 'line', 'data-id': LINE },
        dragHandle(LINE, 'the if-there’s-time line'),
        h('span', { class: 'line-label' }, 'If there’s time', optional.length === 0 && h('span', { class: 'muted' }, ' · drag tasks below this line'))),
      optional.map(row));
  }

  function dragHandle(id, label) {
    return h('button', {
      class: 'drag', type: 'button', title: 'Drag to move', 'aria-label': `Move ${label}`, 'data-k': `drag-${id}`,
      onpointerdown: (e) => startDrag(e),
      onkeydown: (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const li = e.target.closest('li');
        const sib = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
        if (!sib) return;
        if (e.key === 'ArrowUp') sib.before(li); else sib.after(li);
        saveOrder(li.parentElement);
        // moving the row drops focus; put it back so you can keep pressing
        $(`[data-k="drag-${id}"]`)?.focus();
      },
    }, '⠿');
  }

  // Moves the row itself as you drag, so what you see is the new order.
  function startDrag(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const li = e.target.closest('li');
    const list = li.parentElement;
    li.classList.add('dragging');
    document.body.classList.add('is-dragging');
    const move = (ev) => {
      const others = [...list.children].filter((x) => x !== li);
      const before = others.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (before) { if (li.nextElementSibling !== before) list.insertBefore(li, before); } else if (list.lastElementChild !== li) list.append(li);
      // keep going past the edge of the window
      if (ev.clientY < 40) window.scrollBy(0, -12); else if (ev.clientY > innerHeight - 40) window.scrollBy(0, 12);
    };
    const end = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      li.classList.remove('dragging');
      document.body.classList.remove('is-dragging');
      saveOrder(list);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }

  function saveOrder(list) {
    const byId = new Map(App.state.tasks.map((t) => [t.id, t]));
    const ids = [...list.children].map((x) => x.dataset.id);
    const before = App.state.tasks.map((t) => `${t.id}:${t.order}:${!!t.optional}`).join();
    let optional = false;
    ids.forEach((id, i) => {
      if (id === LINE) { optional = true; return; }
      Object.assign(byId.get(id), { order: i, optional });
    });
    if (App.state.tasks.map((t) => `${t.id}:${t.order}:${!!t.optional}`).join() === before) return;
    Engine.reorderToday(App.state, App.today);
    App.commit();
  }

  // ---------------------------------------------------------------- folded sections
  function fold(id, title, summary, ...body) {
    return h('details', {
      class: 'fold', open: openFolds.has(id),
      ontoggle: (e) => {
        if (e.target.open) openFolds.add(id); else openFolds.delete(id);
        saveFolds();
      },
    },
    h('summary', {}, h('span', { class: 'fold-title' }, title), h('span', { class: 'fold-sum' }, summary)),
    h('div', { class: 'fold-body' }, body));
  }

  // Saved time windows: edit in place, and put one on every any-time task
  // with a single click.
  function windowsFold(s) {
    const tasks = App.state.tasks.filter((t) => !(t.kind === 'once' && t.doneOn));
    const anyTime = tasks.filter(isAnyTime);
    const usedBy = (p) => tasks.filter((t) => t.window === p.id).length;
    const sync = () => { Store.syncWindows(App.state); App.commit(); };
    const change = (p, key) => (e) => {
      const v = key === 'name' ? e.target.value.trim() : e.target.value;
      if (key !== 'name' || v) p[key] = v;   // a blank name keeps the old one
      sync();
    };

    const applyToAnyTime = (p) => {
      const changed = anyTime.map((t) => ({ t, before: { window: t.window, from: t.from, to: t.to } }));
      for (const { t } of changed) Object.assign(t, { window: p.id, from: p.from, to: p.to });
      offerUndo(`${p.name} added to ${changed.length} task${changed.length === 1 ? '' : 's'}`, () => {
        for (const { t, before } of changed) Object.assign(t, before);
      });
      App.commit();
    };

    const addPreset = () => {
      const p = { id: Store.uid(), name: 'New window', from: '08:00', to: '20:00' };
      s.timePresets.push(p);
      App.commit();
      root().querySelector(`[data-k="win-name-${p.id}"]`)?.select();
    };

    const removePreset = (p) => {
      const index = s.timePresets.indexOf(p);
      const linked = App.state.tasks.filter((t) => t.window === p.id);
      const wasNew = s.newWindow === p.id;
      s.timePresets.splice(index, 1);
      for (const t of linked) t.window = '';   // they keep the times, just unlinked
      offerUndo(`Deleted “${p.name}”`, () => {
        s.timePresets.splice(Math.min(index, s.timePresets.length), 0, p);
        for (const t of linked) t.window = p.id;
        if (wasNew) s.newWindow = p.id;
      });
      sync();
    };

    const summary = presets().length
      ? presets().map((p) => (p.name === timeText(p.from, p.to) ? p.name : `${p.name} ${timeText(p.from, p.to)}`)).join(' · ')
      : 'None';

    return fold('windows', 'Time windows', summary,
      h('p', { class: 'muted small' }, 'Save a time window once, then put it on tasks. Changing the times here changes every task that uses it.'),
      presets().length > 0 && h('ul', { class: 'win-list' }, presets().map((p) => {
        const n = usedBy(p);
        const empty = p.from && p.to && p.from >= p.to;
        return h('li', {},
          h('div', { class: 'win-row' },
            h('input', { class: 'win-name', 'aria-label': 'Window name', 'data-k': `win-name-${p.id}`, value: p.name, onchange: change(p, 'name') }),
            h('label', { class: 'row' }, 'from', h('input', { type: 'time', 'data-k': `win-from-${p.id}`, value: p.from, onchange: change(p, 'from') })),
            h('label', { class: 'row' }, 'to', h('input', { type: 'time', 'data-k': `win-to-${p.id}`, value: p.to, onchange: change(p, 'to') })),
            h('button', { class: 'link danger', 'data-k': `win-del-${p.id}`, onclick: () => removePreset(p) }, 'Delete')),
          h('div', { class: 'win-row' },
            h('span', { class: 'muted small' }, n ? `On ${n} task${n === 1 ? '' : 's'}` : 'Not on any tasks yet'),
            anyTime.length > 0 && h('button', { class: 'btn ghost small', 'data-k': `win-apply-${p.id}`, onclick: () => applyToAnyTime(p) },
              `Add to all ${anyTime.length} any-time task${anyTime.length === 1 ? '' : 's'}`)),
          empty && h('p', { class: 'danger small' }, 'That window is empty, so its tasks would never show.'));
      })),
      h('div', {}, h('button', { class: 'link', 'data-k': 'win-add', onclick: addPreset }, '+ New time window')));
  }

  const root = () => $('#view');

  function todayFold() {
    const { state, today } = App;
    const done = Engine.progressFor(state, today).done;
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    const ids = (state.queues[today]?.ids || []).filter((id) => byId.has(id) || done[id]);
    const now = App.nowMinute();
    const current = Engine.next(state, today, now).task;
    const tomorrow = Dates.addDays(today, 1);
    const plan = Engine.plan(state, tomorrow);

    const todayItem = (id) => {
      const t = byId.get(id);
      if (done[id]) return h('li', { class: 'is-done' }, t ? t.name : done[id].name);
      const w = Engine.windowState(t, today, now, state.settings);
      const note = t === current ? ' · on RN now'
        : w.state === 'later' ? ` · from ${Dates.clock(Dates.fromMinutes(w.at))}`
          : w.state === 'closed' ? ' · not today after all' : '';
      return h('li', {}, t.name, h('span', { class: 'muted' }, note));
    };

    return fold('today', 'Today', ids.length ? `${ids.length} on the list` : 'Nothing queued',
      h('div', { class: 'cols' },
        h('div', {},
          h('h3', {}, Dates.long(today)),
          ids.length ? h('ol', { class: 'preview' }, ids.map(todayItem)) : h('p', { class: 'empty' }, 'Nothing queued.')),
        h('div', {},
          h('h3', {}, `Tomorrow, ${Dates.long(tomorrow)}`),
          plan.items.length ? h('ol', { class: 'preview' }, plan.items.map((x) => h('li', { class: x.included ? '' : 'is-out' },
            x.task.name, !x.included && h('span', { class: 'muted' }, ' · no time left'))))
            : h('p', { class: 'empty' }, 'Nothing available.'))),
      h('p', { class: 'muted small' }, 'Today’s order is fixed once the day starts. New tasks go to the end.'));
  }

  function offFold(s) {
    const today = App.today;
    const ranges = [];
    for (const d of [...s.offDays].sort()) {
      if (d < today) continue;
      const last = ranges[ranges.length - 1];
      if (last && Dates.diffDays(last.to, d) === 1) last.to = d;
      else ranges.push({ from: d, to: d });
    }
    const rangeText = (r) => (r.from === r.to ? Dates.long(r.from) : `${Dates.long(r.from)} – ${Dates.long(r.to)}`);
    const toggle = (d) => {
      s.offDays = s.offDays.includes(d) ? s.offDays.filter((x) => x !== d) : [...s.offDays, d].sort();
      App.commit();
    };

    return fold('off', 'Days off', ranges.length ? `Next: ${rangeText(ranges[0])}` : 'None',
      h('div', { class: 'cols' },
        calendar({ key: 'off', isOn: (d) => s.offDays.includes(d), onPick: toggle, min: today, redraw: App.render }),
        h('div', {},
          h('p', { class: 'muted small' }, 'Click days to take them off. Days off get the longer daily limit.'),
          ranges.length > 0 && h('ul', { class: 'plain-list' }, ranges.map((r) => h('li', {},
            h('span', {}, rangeText(r)),
            h('button', {
              class: 'link',
              onclick: () => {
                s.offDays = s.offDays.filter((d) => d < r.from || d > r.to);
                App.commit();
              },
            }, 'Remove')))))));
  }

  function tuningFold(s) {
    const num = (key) => (e) => { s[key] = Math.max(0, Number(e.target.value) || 0); App.commit(); };
    return fold('tuning', 'Daily limits', `${dur(s.budgetWork)} on work days, ${dur(s.budgetOff)} otherwise`,
      h('p', { class: 'muted small' }, 'Tasks above the line always go on the list. Tasks below it are added only while the day stays under these limits.'),
      field('Work days',
        seg(Dates.WEEKDAYS.map((name, i) => opt(name, s.workDays.includes(i), () => {
          s.workDays = s.workDays.includes(i) ? s.workDays.filter((d) => d !== i) : sortDays([...s.workDays, i]);
          App.commit();
        }, `work-day-${i}`)))),
      h('div', { class: 'grid3' },
        h('label', {}, 'Minutes on work days', h('input', { type: 'number', min: 0, step: 5, value: s.budgetWork, 'data-k': 'b-work', onchange: num('budgetWork') })),
        h('label', {}, 'Minutes on other days', h('input', { type: 'number', min: 0, step: 5, value: s.budgetOff, 'data-k': 'b-off', onchange: num('budgetOff') }))));
  }

  function dataFold() {
    return fold('data', 'Backup', 'Saved in this browser only',
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost', onclick: () => Store.download(App.state) }, 'Download backup'),
        h('label', { class: 'btn ghost' }, 'Restore backup',
          h('input', {
            type: 'file', accept: 'application/json', hidden: true,
            onchange: async (e) => {
              const file = e.target.files[0];
              if (!file || !confirm('Replace everything with this backup?')) return;
              try { App.replaceState(await Store.restore(file)); } catch (err) { alert('That file could not be read as a planner backup.'); }
            },
          })),
        h('button', {
          class: 'btn ghost danger',
          onclick: () => {
            if (confirm('Erase all tasks, history and settings from this browser? This cannot be undone.')) App.replaceState(Store.defaults());
          },
        }, 'Erase everything')));
  }

  // ---------------------------------------------------------------- task editor
  // Edits a draft; nothing is saved until Save.
  const dialog = $('#task-dialog');
  const form = $('#task-form');
  let editing = null;
  let draft = null;

  const TIME_PRESETS = [['Any time', '', ''], ['Morning', '', '12:00'], ['Afternoon', '12:00', '17:00'], ['Evening', '17:00', '']];

  function openTask(task) {
    editing = task;
    justAdded = new Set();
    const t = task || Store.task({ kind: 'once' });
    const once = t.kind === 'once';
    // A task with exactly a saved window's times counts as using it.
    const linked = presetOf(t) || (!t.window && (t.from || t.to)
      ? presets().find((p) => p.from === t.from && p.to === t.to) : null);
    draft = {
      name: t.name,
      mode: once ? 'once' : t.days.length === 7 ? 'every' : 'some',
      days: [...t.days],
      onceDays: once ? [...t.days] : [...ALL_DAYS],
      minutes: t.minutes,
      total: once ? (Number(t.total) || Number(t.minutes) || 0) : 30,
      perDay: Number(t.perDay) || 0,
      ownPace: Number(t.perDay) > 0,
      due: once ? t.due : '',
      until: once ? '' : t.due,
      start: t.start,
      from: t.from,
      to: t.to,
      window: linked ? linked.id : '',
      customTime: !linked && !TIME_PRESETS.some(([, f, to]) => f === t.from && to === t.to),
      notes: t.notes,
      cal: null, // which small calendar is open
    };
    draft.moreOpen = moreSummary().length > 0;
    for (const k of ['due', 'start', 'until']) delete calMonth[k];
    drawForm();
    dialog.showModal();
    if (!task) form.querySelector('[data-k=name]').focus();
    else dialog.focus();
  }

  function drawForm() {
    const focused = document.activeElement?.dataset?.k;
    const scroll = dialog.scrollTop;
    form.replaceChildren(...formContents().flat(Infinity).filter((c) => c != null && c !== false));
    if (focused) form.querySelector(`[data-k="${focused}"]`)?.focus({ preventScroll: true });
    dialog.scrollTop = scroll;
  }
  const redraw = (fn) => () => { fn(); drawForm(); };

  // The draft as a task, for working out the daily split.
  function draftTask() {
    const d = draft;
    return {
      id: editing ? editing.id : '_draft', kind: 'once', total: Number(d.total) || 0,
      perDay: d.ownPace ? Number(d.perDay) || 0 : 0, due: d.due, start: d.start, days: d.days,
    };
  }

  // Work already done today counts; the plan starts tomorrow in that case.
  function planStart() {
    const doneToday = editing && Engine.progressFor(App.state, App.today).done[editing.id];
    return doneToday ? Dates.addDays(App.today, 1) : App.today;
  }

  function formContents() {
    const d = draft;
    return [
      h('input', {
        class: 'title-input', name: 'name', 'data-k': 'name', required: true, autocomplete: 'off',
        placeholder: 'What needs doing?', 'aria-label': 'Task', value: d.name, oninput: (e) => { d.name = e.target.value; },
      }),
      d.mode === 'once' ? [dueSection(), workSection()] : [untilSection(), field('How long each time?', minutesField())],
      timeSection(),
      moreSection(),
      h('div', { class: 'dialog-actions' },
        editing && h('button', { type: 'button', class: 'link danger', onclick: () => removeTask(editing) }, 'Delete'),
        editing && editing.kind === 'once' && !editing.doneOn && h('button', {
          type: 'button', class: 'link',
          onclick: () => { Engine.finish(App.state, App.today, editing); dialog.close(); App.commit(); },
        }, 'Mark finished'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'btn' }, 'Save')),
    ];
  }

  function dueSection() {
    const d = draft;
    const start = planStart();
    const plan = Number(d.total) > 0 ? Engine.sessions(App.state, draftTask(), start) : [];
    const workDays = new Map(plan.map((x) => [x.date, x.minutes]));
    return field('Due',
      h('div', { class: 'due-row' },
        calendar({
          key: 'due', start: d.due, redraw: drawForm,
          isOn: (x) => x === d.due,
          onPick: (x) => { d.due = x === d.due ? '' : x; drawForm(); },
          mark: (x) => (workDays.has(x) ? (d.due && x > d.due ? 'late' : 'work') : ''),
        }),
        h('div', { class: 'due-side' },
          h('p', { class: 'big' }, d.due ? Dates.long(d.due) : 'No due date'),
          d.due && h('p', { class: Dates.diffDays(App.today, d.due) < 0 ? 'danger' : 'muted' }, Dates.friendly(d.due)),
          d.due && h('button', { type: 'button', class: 'link', 'data-k': 'due-clear', onclick: redraw(() => { d.due = ''; }) }, 'No due date'),
          plan.length > 1 && h('p', { class: 'legend muted small' }, h('span', { class: 'swatch' }), 'days you’ll work on it'))));
  }

  // Repeating tasks get the same calendar; the date is the last day it repeats.
  function untilSection() {
    const d = draft;
    const ended = d.until && d.until < App.today;
    return field('Last day',
      h('div', { class: 'due-row' },
        calendar({
          key: 'until', start: d.until, redraw: drawForm,
          isOn: (x) => x === d.until,
          onPick: (x) => { d.until = x === d.until ? '' : x; drawForm(); },
        }),
        h('div', { class: 'due-side' },
          h('p', { class: 'big' }, d.until ? Dates.long(d.until) : 'No end date'),
          h('p', { class: ended ? 'danger' : 'muted' },
            ended ? 'Already ended, so it won’t show up.'
              : `Repeats ${daysText(d.days).toLowerCase()}${d.until ? ` until then (${Dates.friendly(d.until)})` : ''}.`),
          d.until && h('button', { type: 'button', class: 'link', 'data-k': 'until-clear', onclick: redraw(() => { d.until = ''; }) }, 'No end date'))));
  }

  function workSection() {
    const d = draft;
    const total = Number(d.total) || 0;
    const presets = [15, 30, 60, 120, 240, 480];
    const start = planStart();
    const t = draftTask();
    const sp = Engine.split(App.state, t, start);
    const plan = total ? Engine.sessions(App.state, t, start) : [];
    const last = plan.length ? plan[plan.length - 1].date : null;
    const late = d.due && last && last > d.due;

    let sentence;
    if (!total) sentence = 'Pick roughly how long it takes, start to finish.';
    else if (!sp.remaining) sentence = 'All of it is done.';
    else if (plan.length === 1) sentence = `One sitting, ${dur(plan[0].minutes)}${plan[0].date === App.today ? ' today' : `, ${Dates.long(plan[0].date)}`}.`;
    else sentence = `${dur(sp.perDay)} a day for ${plan.length} days, done ${Dates.long(last)}.`;

    return field('How much work, in total?',
      seg(presets.map((m) => opt(dur(m), total === m, redraw(() => { d.total = m; }), `total-${m}`)),
        h('label', { class: `seg-input${total && !presets.includes(total) ? ' on' : ''}` },
          h('input', {
            type: 'number', min: 0, step: 0.5, 'aria-label': 'Hours in total', 'data-k': 'total-custom',
            value: total && !presets.includes(total) ? String(Math.round((total / 60) * 100) / 100) : '',
            placeholder: 'other',
            onchange: (e) => { d.total = Math.round((Number(e.target.value) || 0) * 60); drawForm(); },
          }), 'h')),
      h('p', { class: late ? 'danger' : '' }, sentence, late ? ' That’s after it’s due.' : ''),
      // Only shown for tasks that already have their own amount, so there's
      // a way back to automatic; the split is otherwise not a decision.
      total > 60 && d.ownPace && (h('div', { class: 'row wrap' },
          h('label', { class: 'row' }, 'My own amount:',
            h('input', {
              type: 'number', min: 5, step: 5, class: 'narrow', 'data-k': 'per-day', value: d.perDay || sp.auto,
              onchange: (e) => { d.perDay = Math.max(5, Number(e.target.value) || 0); drawForm(); },
            }), 'min a day'),
          h('button', { type: 'button', class: 'link', 'data-k': 'pace-auto', onclick: redraw(() => { d.ownPace = false; }) },
            `Back to automatic (${dur(sp.auto)})`))));
  }

  function minutesField() {
    const d = draft;
    const presets = [5, 15, 30, 60];
    const m = Number(d.minutes);
    return seg(presets.map((x) => opt(dur(x), m === x, redraw(() => { d.minutes = x; }), `min-${x}`)),
      h('label', { class: `seg-input${presets.includes(m) ? '' : ' on'}` },
        h('input', {
          type: 'number', min: 0, step: 5, 'aria-label': 'Minutes', 'data-k': 'min-custom', placeholder: 'other',
          value: presets.includes(m) ? '' : String(m), onchange: (e) => { d.minutes = Number(e.target.value) || 0; drawForm(); },
        }), 'min'));
  }

  function moreSummary() {
    const d = draft;
    const out = [];
    if (d.mode === 'every') out.push('repeats every day');
    if (d.mode === 'some') out.push(`repeats ${daysText(d.days)}`);
    if (d.start && d.start > App.today) out.push(`from ${Dates.short(d.start)}`);
    if (d.notes) out.push('notes');
    return out;
  }

  function setMode(mode) {
    const d = draft;
    if (mode === d.mode) return;
    if (d.mode === 'once') d.onceDays = d.days;
    if (mode === 'once') d.days = d.onceDays;
    else if (mode === 'some' && d.days.length === 7) d.days = [1, 2, 3, 4, 5];
    else if (mode === 'every') d.days = [...ALL_DAYS];
    d.mode = mode;
  }

  // Saved windows first (one click), then the built-in ones, then Custom.
  function timeSection() {
    const d = draft;
    const builtinOn = (f, to) => !d.customTime && !d.window && d.from === f && d.to === to;
    const pick = (f, to, window = '') => redraw(() => { d.from = f; d.to = to; d.window = window; d.customTime = false; });
    const saveAsWindow = () => {
      const p = { id: Store.uid(), name: timeText(d.from, d.to), from: d.from, to: d.to };
      App.state.settings.timePresets.push(p);
      App.save();
      d.window = p.id;
      d.customTime = false;
      drawForm();
    };
    return field('Time of day',
      seg(presets().map((p) => h('button', {
        type: 'button', class: d.window === p.id ? 'on' : '', 'aria-pressed': String(d.window === p.id),
        title: timeText(p.from, p.to), 'data-k': `time-win-${p.id}`, onclick: pick(p.from, p.to, p.id),
      }, p.name)),
      TIME_PRESETS.map(([label, f, to]) => opt(label, builtinOn(f, to), pick(f, to), `time-${label}`)),
      opt('Custom', d.customTime, redraw(() => { d.customTime = true; d.window = ''; }), 'time-custom')),
      d.window && h('p', { class: 'muted small' }, timeText(d.from, d.to)),
      d.customTime && h('div', { class: 'row wrap' },
        h('label', { class: 'row' }, 'Not before', h('input', { type: 'time', 'data-k': 'from', value: d.from, onchange: (e) => { d.from = e.target.value; drawForm(); } })),
        h('label', { class: 'row' }, 'not after', h('input', { type: 'time', 'data-k': 'to', value: d.to, onchange: (e) => { d.to = e.target.value; drawForm(); } })),
        (d.from || d.to) && !(d.from && d.to && d.from >= d.to)
          && h('button', { type: 'button', class: 'link', 'data-k': 'time-save', onclick: saveAsWindow }, 'Save as a time window')),
      d.from && d.to && d.from >= d.to && h('p', { class: 'danger small' }, 'That window is empty, so the task would never show.'));
  }

  // A date shown as text; click to open a calendar.
  function datePick(key, get, set, emptyText) {
    const d = draft;
    const v = get();
    const isOpen = d.cal === key;
    return [
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'link', 'data-k': key, onclick: redraw(() => { d.cal = isOpen ? null : key; }) },
          v ? `${Dates.long(v)} (${Dates.friendly(v)})` : emptyText),
        v && h('button', { type: 'button', class: 'link muted', 'data-k': `${key}-clear`, onclick: redraw(() => { set(''); }) }, 'Clear')),
      isOpen && calendar({
        key, start: v, redraw: drawForm, isOn: (x) => x === v,
        onPick: (x) => { set(x); d.cal = null; drawForm(); },
      }),
    ];
  }

  function moreSection() {
    const d = draft;
    const s = App.state.settings;
    const summary = moreSummary();
    return h('details', { class: 'more', open: d.moreOpen, ontoggle: (e) => { d.moreOpen = e.target.open; } },
      h('summary', {}, 'More', summary.length > 0 && h('span', { class: 'muted' }, ` · ${summary.join(' · ')}`)),
      h('div', { class: 'more-body' },
        field('Repeats',
          seg([['once', 'No'], ['every', 'Every day'], ['some', 'Some days']].map(([v, label]) =>
            opt(label, d.mode === v, redraw(() => setMode(v)), `mode-${v}`))),
          (d.mode === 'some' || (d.mode === 'once' && d.days.length < 7)) && seg(Dates.WEEKDAYS.map((name, i) => opt(name, d.days.includes(i), redraw(() => {
            d.days = d.days.includes(i) ? d.days.filter((x) => x !== i) : sortDays([...d.days, i]);
          }), `day-${i}`))),
          !d.days.length && h('p', { class: 'danger small' }, 'Pick at least one day.')),
        field('Don’t show before', datePick('start', () => d.start, (v) => { d.start = v; }, 'Show right away')),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notes'),
          h('textarea', { rows: 2, 'data-k': 'notes', value: d.notes, oninput: (e) => { d.notes = e.target.value; } }))));
  }

  // One click, no confirmation: an Undo bar shows for a few seconds instead.
  let undoable = null; // { text, run }
  let undoTimer = null;

  function offerUndo(text, run) {
    undoable = { text, run };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undoable = null; App.refresh('config'); }, 8000);
  }

  function removeTask(t) {
    const index = App.state.tasks.indexOf(t);
    if (index < 0) return;
    App.state.tasks.splice(index, 1);
    offerUndo(`Deleted “${t.name}”`, () => {
      App.state.tasks.splice(Math.min(index, App.state.tasks.length), 0, t);
    });
    if (dialog.open) dialog.close();
    App.commit();
  }

  function runUndo() {
    if (!undoable) return;
    undoable.run();
    undoable = null;
    clearTimeout(undoTimer);
    Store.syncWindows(App.state);
    App.commit();
  }

  function undoBar() {
    if (!undoable) return null;
    return h('div', { class: 'toast', role: 'status' },
      h('span', {}, undoable.text),
      h('button', { class: 'link', 'data-k': 'undo', onclick: runUndo }, 'Undo'));
  }

  // Click outside the box to cancel; Cmd/Ctrl+Enter saves from anywhere.
  let downOutside = false;
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  dialog.addEventListener('mousedown', (e) => { downOutside = e.target === dialog && outside(e); });
  dialog.addEventListener('click', (e) => {
    if (downOutside && e.target === dialog && outside(e)) dialog.close();
    downOutside = false;
  });
  document.addEventListener('keydown', (e) => {
    if (dialog.open && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', (e) => {
    const d = draft;
    if (!d.days.length) {
      e.preventDefault();
      d.moreOpen = true;
      drawForm();
      return;
    }
    const once = d.mode === 'once';
    const total = Math.max(0, Number(d.total) || 0);
    const data = {
      name: d.name.trim(),
      kind: once ? 'once' : 'repeat',
      minutes: once ? (total || 15) : Math.max(0, Number(d.minutes) || 0),
      total: once ? total : 0,
      perDay: once && d.ownPace ? Math.max(5, Number(d.perDay) || 0) : 0,
      days: d.mode === 'every' ? [...ALL_DAYS] : sortDays(d.days),
      from: d.from,
      to: d.to,
      window: d.window,
      start: d.start,
      due: once ? d.due : d.until,
      notes: d.notes.trim(),
    };
    if (editing) Object.assign(editing, data);
    else App.state.tasks.push(Store.task(data));
    App.commit();
  });

  return { render };
})();
