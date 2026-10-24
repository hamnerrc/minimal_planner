// Main page: draws every panel from `state` and saves after each change.
(() => {
  let state = Store.load();
  let today = Dates.today();
  let plannerStart = today;   // first day shown in the planner
  let nowSkip = 0;            // how many times "Skip" was pressed on the Right now card

  const $ = (sel) => document.querySelector(sel);

  // Small helper for building elements: h('div', {class: 'x'}, 'text', child)
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  function commit() {
    Store.save(state);
    render();
  }

  const category = (id) => state.categories.find((c) => c.id === id) || { name: 'Uncategorized', color: '#8a948e' };

  // overdue / urgent (≤2 days) / soon (within the "due soon" setting) / later
  function urgency(item) {
    if (item.done || !item.due) return 'later';
    const n = Dates.diffDays(today, item.due);
    if (n < 0) return 'overdue';
    if (n <= 2) return 'urgent';
    if (n <= state.settings.soonDays) return 'soon';
    return 'later';
  }

  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title);

  function todaysDailies() {
    const done = state.dailyLog[today] || [];
    return Schedule.dailyOrder(state.dailies, today).map((d) => ({ ...d, done: done.includes(d.id) }));
  }

  function toggleDaily(id) {
    const done = new Set(state.dailyLog[today] || []);
    done.has(id) ? done.delete(id) : done.add(id);
    state.dailyLog[today] = [...done];
    commit();
  }

  // ---------------------------------------------------------------- render
  function render() {
    $('#today-label').textContent = Dates.long(today);
    renderNow();
    renderStats();
    renderDeadlines();
    renderDailies();
    renderNotes();
    renderPlanner();
  }

  function renderNow() {
    const list = todaysDailies();
    const left = list.filter((d) => !d.done);
    const card = $('#now-card');
    const pct = list.length ? Math.round(((list.length - left.length) / list.length) * 100) : 0;
    card.replaceChildren();

    if (!list.length) {
      card.append(h('div', { class: 'now-label' }, 'Right now'), h('div', { class: 'now-task' }, 'No dailies yet'),
        h('div', { class: 'now-meta' }, 'Add some with Edit on the dailies panel.'));
      return;
    }
    if (!left.length) {
      card.append(h('div', { class: 'now-label' }, 'Right now'), h('div', { class: 'now-task' }, 'All dailies done 🎉'),
        h('div', { class: 'now-meta' }, nextDeadlineText()), h('div', { class: 'progress' }, h('span', { style: 'width:100%' })));
      return;
    }

    const current = left[nowSkip % left.length];
    card.append(
      h('div', { class: 'now-label' }, `Right now · ${list.length - left.length} of ${list.length} done`),
      h('div', { class: 'now-task' }, current.name),
      h('div', { class: 'now-meta' }, `${current.minutes} min · ${current.priority ? 'priority' : 'optional'}`),
      h('div', { class: 'now-actions' },
        h('button', { class: 'btn', onclick: () => { nowSkip = 0; toggleDaily(current.id); } }, 'Done'),
        left.length > 1 && h('button', { class: 'btn ghost', onclick: () => { nowSkip++; renderNow(); } }, 'Skip for now')),
      h('div', { class: 'progress' }, h('span', { style: `width:${pct}%` })),
    );
  }

  function nextDeadlineText() {
    const next = state.deadlines.filter((d) => !d.done && d.due && d.kind === 'deadline').sort(byDue)[0];
    return next ? `Next deadline: ${next.title} (${Dates.relative(next.due, today)})` : 'No upcoming deadlines.';
  }

  function renderStats() {
    const list = todaysDailies();
    const minsLeft = list.filter((d) => !d.done).reduce((s, d) => s + Number(d.minutes || 0), 0);
    const open = state.deadlines.filter((d) => !d.done && d.kind === 'deadline' && d.due);
    const overdue = open.filter((d) => d.due < today).length;
    const soon = open.filter((d) => d.due >= today && Dates.diffDays(today, d.due) <= state.settings.soonDays).length;
    const period = Schedule.rotation(today, state.settings);

    const stat = (value, label, alert) => h('div', { class: `stat${alert ? ' alert' : ''}` },
      h('div', { class: 'stat-value' }, String(value)), h('div', { class: 'stat-label' }, label));

    $('#stats').replaceChildren(
      stat(minsLeft >= 60 ? `${(minsLeft / 60).toFixed(1)}h` : `${minsLeft}m`, 'dailies time left'),
      stat(soon, `due in next ${state.settings.soonDays} days`),
      stat(overdue, 'overdue', overdue > 0),
      stat(period ? `P${period}` : '—', period ? 'work rotation today' : 'not a work day'),
    );
  }

  function renderDeadlines() {
    const filter = $('#deadline-filter');
    const chosen = filter.value || 'all';
    filter.replaceChildren(h('option', { value: 'all' }, 'All categories'),
      ...state.categories.map((c) => h('option', { value: c.id }, c.name)));
    filter.value = state.categories.some((c) => c.id === chosen) ? chosen : 'all';

    const showDone = $('#show-done').checked;
    const cats = filter.value === 'all' ? state.categories : state.categories.filter((c) => c.id === filter.value);
    const known = new Set(state.categories.map((c) => c.id));
    const orphans = state.deadlines.filter((d) => !known.has(d.categoryId));
    const columns = cats.map((c) => ({ cat: c, items: state.deadlines.filter((d) => d.categoryId === c.id) }));
    if (orphans.length && filter.value === 'all') columns.push({ cat: category(null), items: orphans });

    $('#deadline-columns').replaceChildren(...columns.map(({ cat, items }) => {
      const visible = items.filter((d) => showDone || !d.done).sort(byDue);
      return h('div', { class: 'deadline-col' },
        h('h3', {}, h('span', { class: 'dot', style: `background:${cat.color}` }), cat.name),
        visible.length ? visible.map(deadlineCard) : h('p', { class: 'empty' }, 'Nothing here.'),
        h('button', { class: 'add-chip btn ghost small', onclick: () => openDeadline(null, { categoryId: cat.id }) }, '+ Add'));
    }));
  }

  function deadlineCard(d) {
    return h('button', { class: `deadline ${urgency(d)}${d.done ? ' done' : ''}`, onclick: () => openDeadline(d) },
      h('div', { class: 'deadline-title' }, d.title, d.kind === 'event' && h('span', { class: 'tag' }, 'event')),
      h('div', { class: 'deadline-meta' },
        h('span', {}, d.due ? `${Dates.weekdayName(d.due)} ${Dates.short(d.due)}` : 'no date'),
        h('span', { class: 'when' }, d.done ? 'done' : d.due ? Dates.relative(d.due, today) : '')),
      d.notes && h('div', { class: 'deadline-meta' }, d.notes));
  }

  function renderDailies() {
    const list = todaysDailies();
    const total = list.reduce((s, d) => s + Number(d.minutes || 0), 0);
    $('#dailies').replaceChildren(
      ...list.map((d) => {
        const streak = Schedule.streak(d.id, state.dailyLog, today);
        return h('label', { class: `daily ${d.priority ? 'priority' : 'optional'}${d.done ? ' done' : ''}`, title: `rank ${d.rank} · today's score ${d.score.toFixed(2)}` },
          h('input', { type: 'checkbox', checked: d.done, onchange: () => toggleDaily(d.id) }),
          h('span', { class: 'daily-name' }, d.name),
          h('span', { class: 'daily-meta' }, `${d.minutes}m`, streak > 1 ? ` · 🔥${streak}` : ''));
      }),
      list.length ? h('div', { class: 'daily-total' },
        h('span', {}, `${list.filter((d) => d.priority).length} priority · ${list.filter((d) => !d.priority).length} optional`),
        h('span', {}, `${(total / 60).toFixed(1)}h total`))
        : h('p', { class: 'empty' }, 'No dailies yet.'),
    );
  }

  function renderNotes() {
    $('#notes').replaceChildren(...state.notes.map((n) => h('li', { class: n.done ? 'done' : '' },
      h('input', { type: 'checkbox', checked: n.done, onchange: () => { n.done = !n.done; commit(); } }),
      h('span', {}, n.text),
      h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { state.notes = state.notes.filter((x) => x !== n); commit(); } }, '×'))));
  }

  function renderPlanner() {
    const s = state.settings;
    const days = Array.from({ length: s.plannerDays }, (_, i) => Dates.addDays(plannerStart, i));
    const dayClass = (d) => [Dates.weekday(d) % 6 === 0 ? 'weekend' : '', d === today ? 'is-today' : ''].join(' ');

    const head = h('tr', {}, h('th', { class: 'rowhead' }, ''),
      ...days.map((d) => h('th', { class: `day ${dayClass(d)}` }, h('span', { class: 'dow' }, Dates.weekdayName(d).toUpperCase()), Dates.short(d))));

    const rotationRow = h('tr', {}, h('th', { class: 'rowhead' }, 'Work rotation'),
      ...days.map((d) => {
        const p = Schedule.rotation(d, s);
        const off = s.offDays.includes(d);
        const workday = s.workDays.includes(Dates.weekday(d));
        return h('td', {
          class: `rotation ${dayClass(d)}${off ? ' off' : ''}`,
          title: workday ? (off ? 'Day off — click to undo' : 'Click to mark as a day off') : '',
          onclick: workday ? () => toggleOffDay(d) : null,
        }, off ? 'off' : p ? String(p) : '');
      }));

    const eventsRow = h('tr', {}, h('th', { class: 'rowhead' }, 'Due / event'),
      ...days.map((d) => h('td', { class: `events ${dayClass(d)}` },
        ...state.deadlines.filter((x) => x.due === d).sort(byDue).map((x) => h('button', {
          class: `chip ${x.kind}${x.done ? ' done' : ''}`,
          style: x.kind === 'event' ? `color:${category(x.categoryId).color}` : `background:${category(x.categoryId).color}`,
          title: `${x.title} (${category(x.categoryId).name})`,
          onclick: () => openDeadline(x),
        }, x.title)),
        h('button', { class: 'add-chip', title: 'Add on this day', onclick: () => openDeadline(null, { due: d }) }, '+'))));

    const planRow = h('tr', {}, h('th', { class: 'rowhead' }, 'Plan'),
      ...days.map((d) => h('td', { class: dayClass(d) },
        h('textarea', {
          placeholder: '…',
          oninput: (e) => {
            if (e.target.value.trim()) state.plans[d] = e.target.value;
            else delete state.plans[d];
            Store.save(state);
          },
        }, state.plans[d] || ''),
        suggestion(d))));

    const slots = [];
    const start = Dates.toMinutes(s.dayStart);
    const end = Dates.toMinutes(s.dayEnd);
    const workStart = Dates.toMinutes(s.workStart);
    const workEnd = Dates.toMinutes(s.workEnd);
    for (let m = start; m < end; m += 30) {
      const time = Dates.fromMinutes(m);
      slots.push(h('tr', { class: m % 60 === 0 ? 'hour' : '' },
        h('th', { class: 'rowhead' }, m % 60 === 0 ? Dates.clock(time) : ''),
        ...days.map((d) => {
          const label = state.blocks[d]?.[time];
          const work = Schedule.isWorkDay(d, s) && m >= workStart && m < workEnd;
          return h('td', {
            class: `slot ${dayClass(d)}${work ? ' work' : ''}${label ? ' labeled' : ''}`,
            title: `${Dates.weekdayName(d)} ${Dates.short(d)} ${Dates.clock(time)}`,
            onclick: () => editSlot(d, time),
          }, label || (work && m === workStart ? 'work' : ''));
        })));
    }

    $('#planner').replaceChildren(h('thead', {}, head), h('tbody', {}, rotationRow, eventsRow, planRow, ...slots));
  }

  // Under each day's plan box, hint at deadlines due in the next 3 days that
  // still need progress — the "progress things that are due soon" idea.
  function suggestion(d) {
    if (d < today) return null;
    const upcoming = state.deadlines.filter((x) => !x.done && x.kind === 'deadline' && x.due && x.due > d && Dates.diffDays(d, x.due) <= 3);
    if (!upcoming.length) return null;
    return h('div', { class: 'suggest' }, 'Work on: ' + upcoming.sort(byDue).map((x) => x.title).join(', '));
  }

  function toggleOffDay(d) {
    const off = state.settings.offDays;
    state.settings.offDays = off.includes(d) ? off.filter((x) => x !== d) : [...off, d].sort();
    commit();
  }

  function editSlot(d, time) {
    const current = state.blocks[d]?.[time] || '';
    const label = prompt(`${Dates.long(d)}, ${Dates.clock(time)} — what's planned? (leave empty to clear)`, current);
    if (label === null) return;
    state.blocks[d] = state.blocks[d] || {};
    if (label.trim()) state.blocks[d][time] = label.trim();
    else delete state.blocks[d][time];
    if (!Object.keys(state.blocks[d]).length) delete state.blocks[d];
    commit();
  }

  // ---------------------------------------------------------------- deadline dialog
  const deadlineDialog = $('#deadline-dialog');
  const deadlineForm = $('#deadline-form');
  let editingDeadline = null;

  function openDeadline(item, preset = {}) {
    editingDeadline = item;
    const f = deadlineForm.elements;
    f.categoryId.replaceChildren(...state.categories.map((c) => h('option', { value: c.id }, c.name)));
    const d = item || { kind: 'deadline', title: '', due: today, categoryId: state.categories[0]?.id, notes: '', done: false, ...preset };
    f.title.value = d.title;
    f.kind.value = d.kind;
    f.due.value = d.due || '';
    f.categoryId.value = d.categoryId;
    f.notes.value = d.notes || '';
    f.done.checked = !!d.done;
    $('#deadline-dialog-title').textContent = item ? 'Edit' : 'New deadline or event';
    $('#deadline-delete').hidden = !item;
    deadlineDialog.showModal();
    f.title.focus();
  }

  deadlineForm.addEventListener('submit', () => {
    const f = deadlineForm.elements;
    const data = {
      title: f.title.value.trim(), kind: f.kind.value, due: f.due.value || null,
      categoryId: f.categoryId.value, notes: f.notes.value.trim(), done: f.done.checked,
    };
    if (editingDeadline) Object.assign(editingDeadline, data);
    else state.deadlines.push({ id: Store.uid(), ...data });
    commit();
  });
  $('#deadline-cancel').addEventListener('click', () => deadlineDialog.close());
  $('#deadline-delete').addEventListener('click', () => {
    if (!confirm(`Delete "${editingDeadline.title}"?`)) return;
    state.deadlines = state.deadlines.filter((d) => d !== editingDeadline);
    deadlineDialog.close();
    commit();
  });

  // ---------------------------------------------------------------- dailies dialog
  const dailiesDialog = $('#dailies-dialog');

  function dailyRow(d = { id: Store.uid(), name: '', minutes: 15, rank: 5 }) {
    const row = h('div', { class: 'daily-edit-row', 'data-id': d.id },
      h('input', { name: 'name', value: d.name, placeholder: 'Task', required: true }),
      h('input', { name: 'minutes', type: 'number', min: 0, value: d.minutes }),
      h('input', { name: 'rank', type: 'number', min: 1, step: 'any', value: d.rank }),
      h('button', { type: 'button', class: 'icon-btn', title: 'Remove', onclick: () => row.remove() }, '×'));
    return row;
  }

  $('#edit-dailies-btn').addEventListener('click', () => {
    $('#dailies-edit').replaceChildren(...state.dailies.map(dailyRow));
    dailiesDialog.showModal();
  });
  $('#daily-add').addEventListener('click', () => $('#dailies-edit').append(dailyRow()));
  $('#dailies-cancel').addEventListener('click', () => dailiesDialog.close());
  $('#dailies-form').addEventListener('submit', () => {
    state.dailies = [...$('#dailies-edit').children].map((row) => ({
      id: row.dataset.id,
      name: row.querySelector('[name=name]').value.trim(),
      minutes: Number(row.querySelector('[name=minutes]').value) || 0,
      rank: Number(row.querySelector('[name=rank]').value) || 10,
    })).filter((d) => d.name);
    commit();
  });

  // ---------------------------------------------------------------- settings dialog
  const settingsDialog = $('#settings-dialog');
  const settingsForm = $('#settings-form');

  function categoryRow(c = { id: Store.uid(), name: '', color: '#6b7f99' }) {
    const row = h('div', { class: 'category-edit-row', 'data-id': c.id },
      h('input', { type: 'color', name: 'color', value: c.color }),
      h('input', { name: 'name', value: c.name, placeholder: 'Category name' }),
      h('button', {
        type: 'button', class: 'icon-btn', title: 'Remove',
        onclick: () => {
          const used = state.deadlines.filter((d) => d.categoryId === c.id).length;
          if (used && !confirm(`${used} item(s) use this category. They'll show as "Uncategorized". Remove anyway?`)) return;
          row.remove();
        },
      }, '×'));
    return row;
  }

  $('#settings-btn').addEventListener('click', () => {
    const s = state.settings;
    const f = settingsForm.elements;
    for (const key of ['rotationAnchor', 'anchorPeriod', 'cycleLength', 'workStart', 'workEnd', 'dayStart', 'dayEnd', 'soonDays', 'plannerDays']) {
      f[key].value = s[key];
    }
    $('#workdays-field').replaceChildren(h('legend', {}, 'Work days'),
      ...Dates.WEEKDAYS.map((name, i) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', name: 'workDay', value: i, checked: s.workDays.includes(i) }), name)));
    $('#categories-edit').replaceChildren(...state.categories.map(categoryRow));
    settingsDialog.showModal();
  });
  $('#category-add').addEventListener('click', () => $('#categories-edit').append(categoryRow()));
  $('#settings-cancel').addEventListener('click', () => settingsDialog.close());
  settingsForm.addEventListener('submit', () => {
    const f = settingsForm.elements;
    const s = state.settings;
    s.rotationAnchor = f.rotationAnchor.value || today;
    s.cycleLength = Math.max(1, Number(f.cycleLength.value) || 1);
    s.anchorPeriod = Math.min(s.cycleLength, Math.max(1, Number(f.anchorPeriod.value) || 1));
    s.workDays = [...settingsForm.querySelectorAll('[name=workDay]:checked')].map((el) => Number(el.value));
    for (const key of ['workStart', 'workEnd', 'dayStart', 'dayEnd']) s[key] = f[key].value || s[key];
    s.soonDays = Math.max(1, Number(f.soonDays.value) || 7);
    s.plannerDays = Math.min(28, Math.max(1, Number(f.plannerDays.value) || 14));
    state.categories = [...$('#categories-edit').children].map((row) => ({
      id: row.dataset.id,
      name: row.querySelector('[name=name]').value.trim() || 'Untitled',
      color: row.querySelector('[name=color]').value,
    }));
    commit();
  });

  $('#backup-btn').addEventListener('click', () => Store.download(state));
  $('#restore-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !confirm('Replace everything on this page with the backup?')) return;
    try {
      state = await Store.restore(file);
      settingsDialog.close();
      commit();
    } catch (err) {
      alert('That file could not be read as a planner backup.');
    }
  });
  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('Erase all deadlines, dailies, plans and settings from this browser? This cannot be undone.')) return;
    Store.clear();
    state = Store.defaults();
    settingsDialog.close();
    commit();
  });

  // ---------------------------------------------------------------- misc wiring
  $('#add-deadline-btn').addEventListener('click', () => openDeadline(null));
  $('#deadline-filter').addEventListener('change', renderDeadlines);
  $('#show-done').addEventListener('change', renderDeadlines);
  $('#note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#note-input').value.trim();
    if (!text) return;
    state.notes.push({ id: Store.uid(), text, done: false });
    $('#note-input').value = '';
    commit();
  });
  $('#planner-prev').addEventListener('click', () => { plannerStart = Dates.addDays(plannerStart, -7); renderPlanner(); });
  $('#planner-next').addEventListener('click', () => { plannerStart = Dates.addDays(plannerStart, 7); renderPlanner(); });
  $('#planner-today').addEventListener('click', () => { plannerStart = today; renderPlanner(); });

  // If the page is left open past midnight, roll over to the new day.
  setInterval(() => {
    if (Dates.today() !== today) {
      today = Dates.today();
      plannerStart = today;
      nowSkip = 0;
      render();
    }
  }, 60 * 1000);

  // Keep multiple open tabs in sync.
  window.addEventListener('storage', () => { state = Store.load(); render(); });

  render();
})();
