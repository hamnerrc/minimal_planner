// RN: one task at a time. Done → next. Nothing else.
const RnView = (() => {
  const { h } = Dom;
  let lastDone = null;   // { task, date } for the brief Undo link
  let undoTimer = null;
  let lastClick = 0;

  function render(root) {
    const { state, today } = App;
    const next = Engine.next(state, today, App.nowMinute());
    let body;

    if (next.task) {
      const t = next.task;
      if (Engine.markShown(state, today, t.id)) App.save();
      const due = t.kind === 'once' && t.due ? dueNote(t.due, today) : null;
      const mins = Engine.sessionMinutes(state, t, today);
      const sp = Engine.isSpread(t) ? Engine.split(state, t, today) : null;
      const big = sp && sp.remaining > mins;
      const sub = mins ? `about ${mins} min${big ? ' today' : ''}` : '';
      body = [
        h('p', { class: 'rn-task' }, t.name),
        h('p', { class: 'rn-sub' }, sub, due && sub ? ' · ' : '', due && h('span', { class: due.overdue ? 'danger' : '' }, due.text)),
        t.notes && h('p', { class: 'rn-notes' }, t.notes),
        h('button', { class: 'rn-done', onclick: () => done(t) }, big ? 'Done for today' : 'Done'),
        big && h('button', { class: 'rn-undo', onclick: () => finishAll(t) }, 'Finished the whole thing'),
      ];
    } else if (next.waitUntil != null) {
      body = [
        h('p', { class: 'rn-rest' }, 'Nothing right now'),
        h('p', { class: 'rn-sub' }, `Next task at ${Dates.clock(Dates.fromMinutes(next.waitUntil))}`),
      ];
    } else {
      body = [h('p', { class: 'rn-rest' }, 'Done for today')];
    }

    const undo = lastDone && lastDone.date === today
      && h('button', { class: 'rn-undo', onclick: undoLast }, `Undo “${lastDone.task.name}”`);
    root.append(h('div', { class: 'rn' }, body, h('div', { class: 'rn-undo-slot' }, undo)));
    // Ready for Enter/Space, so finishing a task needs no aiming.
    if (!document.querySelector('dialog[open]')) root.querySelector('.rn-done')?.focus({ preventScroll: true });
  }

  function dueNote(due, today) {
    const n = Dates.diffDays(today, due);
    if (n < 0) return { text: 'overdue', overdue: true };
    if (n <= 6) return { text: `due ${Dates.friendly(due, today)}` };
    return null;
  }

  function done(task) {
    // ignore a double-click landing on the next task's button
    if (Date.now() - lastClick < 700) return;
    lastClick = Date.now();
    Engine.complete(App.state, App.today, task);
    App.save();
    lastDone = { task, date: App.today };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { lastDone = null; App.refresh('rn'); }, 8000);
    App.render();
  }

  function finishAll(task) {
    Engine.finish(App.state, App.today, task);
    App.save();
    lastDone = { task, date: App.today };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { lastDone = null; App.refresh('rn'); }, 8000);
    App.render();
  }

  function undoLast() {
    if (!lastDone) return;
    Engine.undo(App.state, lastDone.date, lastDone.task);
    lastDone = null;
    clearTimeout(undoTimer);
    App.save();
    App.render();
  }

  return { render };
})();
