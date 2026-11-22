// Controller: holds the state, switches tabs (#rn, #config), keeps
// today's queue in place, and re-renders the active tab.
const App = (() => {
  const views = { rn: RnView, config: ConfigView };
  const root = Dom.$('#view');

  const app = {
    state: Store.load(),
    today: Dates.today(),

    nowMinute() {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    },

    save() {
      Store.save(app.state);
    },

    // After any configuration change: reconcile today's queue, save, redraw.
    commit({ quiet = false } = {}) {
      Engine.ensureQueue(app.state, app.today);
      app.save();
      if (!quiet) app.render();
    },

    replaceState(next) {
      app.state = next;
      app.commit();
    },

    render() {
      const tab = currentTab();
      document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.hash === `#${tab}`));
      document.body.dataset.tab = tab;
      // keep keyboard focus on the same control across a redraw
      const focused = document.activeElement?.dataset?.k;
      root.replaceChildren();
      views[tab].render(root);
      if (focused) root.querySelector(`[data-k="${focused}"]`)?.focus({ preventScroll: true });
    },

    // Redraw only if that tab is showing (used by timers).
    refresh(tab) {
      if (currentTab() === tab) app.render();
    },
  };

  function currentTab() {
    const tab = location.hash.slice(1);
    return views[tab] ? tab : 'rn';
  }

  // Midnight rollover and time windows opening: check every 30 seconds.
  let lastMinute = app.nowMinute();
  setInterval(() => {
    if (Dates.today() !== app.today) {
      app.today = Dates.today();
      app.commit();
    } else if (app.nowMinute() !== lastMinute) {
      app.refresh('rn');
    }
    lastMinute = app.nowMinute();
  }, 30 * 1000);

  // Another open tab saved something: pick it up.
  window.addEventListener('storage', () => {
    app.state = Store.load();
    app.render();
  });
  window.addEventListener('hashchange', () => app.render());

  // Defer the first draw until this object exists, since views read App.
  queueMicrotask(() => app.commit());
  return app;
})();
