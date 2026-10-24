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
      body = [
        h('p', { class: 'rn-task' }, t.name),
        h('p', { class: 'rn-sub' }, t.minutes ? `about ${t.minutes} min` : ''),
        t.notes && h('p', { class: 'rn-notes' }, t.notes),
        h('button', { class: 'rn-done', onclick: () => done(t) }, 'Done'),
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
