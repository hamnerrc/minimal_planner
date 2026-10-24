// Configuration: tasks, their priority/duration/availability, the work
// schedule, and a look at how the engine is ordering things.
const ConfigView = (() => {
  const { h, $ } = Dom;
  let editing = null; // task open in the dialog (null = new)

  const byPriority = (a, b) => (Number(a.priority) - Number(b.priority)) || a.name.localeCompare(b.name);

  function timeWindow(t) {
    if (t.from && t.to) return `${Dates.clock(t.from)}–${Dates.clock(t.to)}`;
    if (t.from) return `after ${Dates.clock(t.from)}`;
    if (t.to) return `before ${Dates.clock(t.to)}`;
    return '';
  }

  function availability(t) {
    const days = [...t.days].sort().join();
    const parts = [
      days === '0,1,2,3,4,5,6' ? 'every day'
        : days === '1,2,3,4,5' ? 'weekdays'
          : days === '0,6' ? 'weekends'
            : days === '' ? 'never'
              : [...t.days].sort().map((d) => Dates.WEEKDAYS[d]).join(' '),
    ];
    if (t.periods.length) parts.push(`period ${[...t.periods].sort((a, b) => a - b).join(', ')}`);
    if (timeWindow(t)) parts.push(timeWindow(t));
    if (t.avoidWork) parts.push('outside work');
    if (t.start) parts.push(`from ${Dates.short(t.start)}`);
    if (t.due) parts.push(`${t.kind === 'once' ? 'due' : 'until'} ${Dates.short(t.due)}`);
    return parts.join(' · ');
  }

  function render(root) {
    const { state } = App;
    const open = state.tasks.filter((t) => !(t.kind === 'once' && t.doneOn)).sort(byPriority);
    const finished = state.tasks.filter((t) => t.kind === 'once' && t.doneOn).sort((a, b) => b.doneOn.localeCompare(a.doneOn));

    root.append(
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('h2', {}, 'Tasks'),
          h('button', { class: 'btn', onclick: () => openTask(null) }, '+ Add task')),
        h('p', { class: 'muted' }, 'Priority 1–9 is always queued, near that spot. 10+ is optional and fills spare time. New tasks join the end of today’s queue; other changes reorder from tomorrow.'),
        open.length ? taskTable(open) : h('p', { class: 'empty' }, 'No tasks yet.'),
        finished.length > 0 && h('details', { class: 'finished' },
          h('summary', {}, `Finished one-time tasks (${finished.length})`),
          h('ul', { class: 'plain-list' }, finished.map((t) => h('li', {},
            h('span', {}, t.name, h('span', { class: 'muted' }, ` · done ${Dates.short(t.doneOn)}`)),
            h('button', { class: 'btn ghost small', onclick: () => { delete t.doneOn; App.commit(); } }, 'Bring back'),
            h('button', { class: 'icon-btn', title: 'Delete', onclick: () => removeTask(t) }, '×')))))),
      schedulePanel(state.settings),
      previewPanel(),
      dataPanel(),
    );
  }

  function taskTable(tasks) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'tasks' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Task'), h('th', { class: 'num' }, 'Priority'), h('th', { class: 'num' }, 'Minutes'), h('th', {}, 'When'))),
      h('tbody', {}, tasks.map((t) => h('tr', { tabindex: 0, onclick: () => openTask(t), onkeydown: (e) => { if (e.key === 'Enter') openTask(t); } },
        h('td', {}, t.name, t.kind === 'once' && h('span', { class: 'tag' }, 'once')),
        h('td', { class: 'num' }, h('span', { class: `prio ${Number(t.priority) < 10 ? 'high' : 'opt'}` }, String(t.priority))),
        h('td', { class: 'num' }, String(t.minutes)),
        h('td', { class: 'muted' }, availability(t)))))));
  }

  // ---------------------------------------------------------------- schedule
  function schedulePanel(s) {
    // Settings save on change without re-rendering, so typing isn't interrupted.
    const set = (key, parse = (v) => v) => (e) => {
      s[key] = parse(e.target.value);
      if (key === 'cycleLength' || key === 'anchorPeriod') {
        s.cycleLength = Math.max(1, s.cycleLength || 1);
        s.anchorPeriod = Math.min(s.cycleLength, Math.max(1, s.anchorPeriod || 1));
      }
      App.commit({ quiet: true });
      $('#period-today').textContent = periodText();
    };
    const num = (v) => Math.max(0, Number(v) || 0);
    const upcomingOff = s.offDays.filter((d) => d >= Dates.addDays(App.today, -7));

    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Schedule')),
      h('div', { class: 'form-grid' },
        h('fieldset', { class: 'weekdays' }, h('legend', {}, 'Work days'),
          Dates.WEEKDAYS.map((name, i) => h('label', { class: 'check' },
            h('input', {
              type: 'checkbox', checked: s.workDays.includes(i),
              onchange: (e) => {
                s.workDays = e.target.checked ? [...s.workDays, i].sort() : s.workDays.filter((d) => d !== i);
                App.commit({ quiet: true });
                $('#period-today').textContent = periodText();
              },
            }), name))),
        h('label', {}, 'Work starts', h('input', { type: 'time', value: s.workStart, onchange: set('workStart') })),
        h('label', {}, 'Work ends', h('input', { type: 'time', value: s.workEnd, onchange: set('workEnd') })),
      ),
      h('h3', {}, 'Rotating work schedule'),
      h('div', { class: 'form-grid' },
        h('label', {}, 'On this date…', h('input', { type: 'date', value: s.rotationAnchor, onchange: set('rotationAnchor', (v) => v || App.today) })),
        h('label', {}, '…it was period', h('input', { type: 'number', min: 1, value: s.anchorPeriod, onchange: set('anchorPeriod', num) })),
        h('label', {}, 'Periods in cycle', h('input', { type: 'number', min: 1, value: s.cycleLength, onchange: set('cycleLength', num) })),
        h('p', { class: 'muted', id: 'period-today' }, periodText()),
      ),
      h('h3', {}, 'Days off'),
      h('p', { class: 'muted' }, 'No work, and the rotation pauses.'),
      h('ul', { class: 'chips' }, upcomingOff.map((d) => h('li', {},
        `${Dates.weekdayName(d)} ${Dates.short(d)}`,
        h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { s.offDays = s.offDays.filter((x) => x !== d); App.commit(); } }, '×')))),
      h('form', {
        class: 'inline-form',
        onsubmit: (e) => {
          e.preventDefault();
          const d = e.target.elements.off.value;
          if (d && !s.offDays.includes(d)) { s.offDays = [...s.offDays, d].sort(); App.commit(); }
        },
      }, h('input', { type: 'date', name: 'off', required: true }), h('button', { class: 'btn ghost small' }, 'Add day off')),
      h('h3', {}, 'Daily time budget'),
      h('p', { class: 'muted' }, 'Priority tasks are always queued. Optional tasks are added only while the day’s total stays within this.'),
      h('div', { class: 'form-grid' },
        h('label', {}, 'Work days (minutes)', h('input', { type: 'number', min: 0, step: 5, value: s.budgetWork, onchange: set('budgetWork', num) })),
        h('label', {}, 'Days off (minutes)', h('input', { type: 'number', min: 0, step: 5, value: s.budgetOff, onchange: set('budgetOff', num) })),
        h('label', {}, 'Due dates boost priority from (days out)', h('input', { type: 'number', min: 0, value: s.soonDays, onchange: set('soonDays', num) })),
      ),
    );
  }

  function periodText() {
    const p = Engine.rotation(App.today, App.state.settings);
    return p ? `Today is period ${p}.` : 'Today is not a work day.';
  }

  // ---------------------------------------------------------------- preview
  // Lets you check the engine's decisions. RN never shows this.
  function previewPanel() {
    const { state, today } = App;
    const done = Engine.progressFor(state, today).done;
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    const queue = (state.queues[today]?.ids || []).map((id) => byId.get(id) || { id, name: done[id]?.name || '(deleted)' });
    const tomorrow = Dates.addDays(today, 1);
    const plan = Engine.plan(state, tomorrow);

    return h('section', { class: 'panel' },
      h('details', {},
        h('summary', {}, h('h2', { class: 'inline' }, 'How the queue is built')),
        h('div', { class: 'preview-cols' },
          h('div', {},
            h('h3', {}, `Today (locked in)`),
            queue.length ? h('ol', { class: 'preview' }, queue.map((t) => h('li', { class: done[t.id] ? 'is-done' : '' }, t.name)))
              : h('p', { class: 'empty' }, 'Nothing queued.')),
          h('div', {},
            h('h3', {}, `Tomorrow (as configured now)`),
            plan.items.length ? h('ol', { class: 'preview' }, plan.items.map((x) => h('li', { class: x.included ? '' : 'is-out' },
              x.task.name,
              h('span', { class: 'muted' }, ` · rank ${round(x.rank)} → ${round(x.score)}${x.included ? '' : ' · left out, over time budget'}`))))
              : h('p', { class: 'empty' }, 'Nothing available.'),
            h('p', { class: 'muted' }, `Time budget: ${plan.budget} min.`)))));
  }

  const round = (n) => Math.round(n * 100) / 100;

  // ---------------------------------------------------------------- data
  function dataPanel() {
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Your data')),
      h('p', { class: 'muted' }, 'Saved only in this browser on this computer. A backup file lets you move it or keep it safe.'),
      h('div', { class: 'button-row' },
        h('button', { class: 'btn ghost small', onclick: () => Store.download(App.state) }, 'Download backup'),
        h('label', { class: 'btn ghost small' }, 'Restore backup',
          h('input', {
            type: 'file', accept: 'application/json', hidden: true,
            onchange: async (e) => {
              const file = e.target.files[0];
              if (!file || !confirm('Replace everything with this backup?')) return;
              try { App.replaceState(await Store.restore(file)); } catch (err) { alert('That file could not be read as a planner backup.'); }
            },
          })),
        h('button', {
          class: 'btn ghost small danger',
          onclick: () => {
            if (confirm('Erase all tasks, history and settings from this browser? This cannot be undone.')) App.replaceState(Store.defaults());
          },
        }, 'Erase everything')));
  }

  // ---------------------------------------------------------------- task dialog
  const dialog = $('#task-dialog');
  const form = $('#task-form');

  function openTask(task) {
    editing = task;
    const t = task || Store.task({});
    const f = form.elements;
    f.name.value = t.name;
    f.kind.value = t.kind;
    f.priority.value = t.priority;
    f.minutes.value = t.minutes;
    form.querySelectorAll('[name=day]').forEach((el) => { el.checked = t.days.includes(Number(el.value)); });
    f.from.value = t.from;
    f.to.value = t.to;
    f.avoidWork.checked = t.avoidWork;
    f.start.value = t.start;
    f.due.value = t.due;
    f.notes.value = t.notes;
    const cycle = App.state.settings.cycleLength;
    $('#task-periods').replaceChildren(h('legend', {}, 'Only on rotation periods (none checked = any day)'),
      Array.from({ length: cycle }, (_, i) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', name: 'period', value: i + 1, checked: t.periods.includes(i + 1) }), String(i + 1))));
    $('#task-dialog-title').textContent = task ? 'Edit task' : 'New task';
    $('#task-delete').hidden = !task;
    syncKind();
    dialog.showModal();
    f.name.focus();
  }

  function syncKind() {
    $('#task-due-label').firstChild.textContent = form.elements.kind.value === 'once' ? 'Due date ' : 'Repeat until ';
  }

  function removeTask(t) {
    if (!confirm(`Delete “${t.name}”? Its history stays in Meta.`)) return;
    App.state.tasks = App.state.tasks.filter((x) => x !== t);
    dialog.close();
    App.commit();
  }

  form.elements.kind.addEventListener('change', syncKind);
  $('#task-cancel').addEventListener('click', () => dialog.close());
  $('#task-delete').addEventListener('click', () => removeTask(editing));
  form.addEventListener('submit', () => {
    const f = form.elements;
    const checked = (name) => [...form.querySelectorAll(`[name=${name}]:checked`)].map((el) => Number(el.value));
    const data = {
      name: f.name.value.trim(),
      kind: f.kind.value,
      priority: Math.max(1, Number(f.priority.value) || 10),
      minutes: Math.max(0, Number(f.minutes.value) || 0),
      days: checked('day'),
      from: f.from.value,
      to: f.to.value,
      avoidWork: f.avoidWork.checked,
      periods: checked('period'),
      start: f.start.value,
      due: f.due.value,
      notes: f.notes.value.trim(),
    };
    if (editing) Object.assign(editing, data);
    else App.state.tasks.push(Store.task(data));
    App.commit();
  });

  return { render };
})();
