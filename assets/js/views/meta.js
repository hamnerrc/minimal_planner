// Meta: completion times and throughput.
const MetaView = (() => {
  const { h, svg } = Dom;
  const RANGES = [7, 14, 30, 90];
  let range = 14;

  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const fmtMin = (m) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`);
  const timeOf = (ts) => {
    const d = new Date(ts);
    return Dates.clock(Dates.fromMinutes(d.getHours() * 60 + d.getMinutes()));
  };

  function collect() {
    const { state, today } = App;
    return Array.from({ length: range }, (_, i) => Dates.addDays(today, i - range + 1)).map((date) => {
      const q = state.queues[date]?.ids || [];
      const done = state.progress[date]?.done || {};
      const entries = Object.entries(done).map(([id, e]) => ({ id, ...e, actual: Engine.actualMinutes(e) }));
      return { date, queue: q, entries };
    });
  }

  function render(root) {
    const days = collect();
    const entries = days.flatMap((d) => d.entries);
    const queued = days.reduce((n, d) => n + d.queue.length, 0);
    const doneFromQueue = days.reduce((n, d) => n + d.entries.filter((e) => d.queue.includes(e.id)).length, 0);
    const activeDays = days.filter((d) => d.queue.length).length;
    const actuals = entries.map((e) => e.actual).filter((m) => m != null);
    const ratios = entries.filter((e) => e.actual != null && e.minutes > 0).map((e) => e.actual / e.minutes);
    const ratio = median(ratios);

    root.append(
      h('div', { class: 'range-row', role: 'group', 'aria-label': 'Time range' },
        RANGES.map((n) => h('button', { class: `btn ghost small${n === range ? ' active' : ''}`, onclick: () => { range = n; App.render(); } }, `${n} days`))),
      h('div', { class: 'tiles' },
        tile(entries.length, 'tasks done'),
        tile(queued ? `${Math.round((doneFromQueue / queued) * 100)}%` : '—', 'of queued tasks done'),
        tile(activeDays ? (entries.length / activeDays).toFixed(1) : '—', 'done per active day'),
        tile(fmtMin(median(actuals)), 'typical time per task'),
        tile(ratio == null ? '—' : `${ratio.toFixed(1)}×`, 'actual vs. estimate')),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Tasks done per day')),
        chart(days),
        h('details', {}, h('summary', {}, 'Show as table'), dayTable(days))),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'By task')),
        taskTable(days)),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Today')),
        todayLog(days[days.length - 1])),
      h('p', { class: 'muted small' }, 'Time per task is measured from when it appears on RN to when you press Done (ignored if over 4 hours).'),
    );
  }

  const tile = (value, label) => h('div', { class: 'tile' }, h('div', { class: 'tile-value' }, String(value)), h('div', { class: 'tile-label' }, label));

  // Single series bar chart, one bar per day, with a hover tooltip.
  function chart(days) {
    const W = 720, H = 200, L = 30, R = 8, T = 10, B = 24;
    const innerW = W - L - R, innerH = H - T - B;
    const max = Math.max(1, ...days.map((d) => Math.max(d.entries.length, d.queue.length)));
    const step = max <= 5 ? 1 : Math.ceil(max / 4);
    const top = Math.ceil(max / step) * step;
    const y = (v) => T + innerH - (v / top) * innerH;
    const band = innerW / days.length;
    const barW = Math.max(2, Math.min(28, band - 4));
    const labelEvery = Math.ceil(days.length / 10);

    const tip = h('div', { class: 'chart-tip', hidden: true });
    const wrap = h('div', { class: 'chart' });

    const grid = [];
    for (let v = 0; v <= top; v += step) {
      grid.push(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }));
      grid.push(svg('text', { x: L - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, String(v)));
    }

    const bars = days.map((d, i) => {
      const x = L + i * band + (band - barW) / 2;
      const n = d.entries.length;
      const hgt = y(0) - y(n);
      const today = d.date === App.today;
      return svg('g', { class: 'col' },
        n > 0 && svg('path', { class: `bar${today ? ' today' : ''}`, d: barPath(x, y(n), barW, hgt, 4) }),
        i % labelEvery === 0 && svg('text', { x: x + barW / 2, y: H - 6, class: 'tick', 'text-anchor': 'middle' }, Dates.short(d.date)),
        // hit target: the whole column, bigger than the bar
        svg('rect', {
          class: 'hit', x: L + i * band, y: T, width: band, height: innerH,
          onmouseenter: () => {
            const mins = d.entries.reduce((m, e) => m + (e.actual ?? 0), 0);
            tip.replaceChildren(
              h('strong', {}, Dates.long(d.date)),
              h('div', {}, `${n} done${d.queue.length ? ` of ${d.queue.length} queued` : ''}`),
              mins > 0 && h('div', { class: 'muted' }, `${fmtMin(mins)} measured`));
            tip.hidden = false;
            const pct = (L + i * band + band / 2) / W;
            tip.style.left = `${pct * 100}%`;
            tip.style.transform = `translateX(${pct > 0.7 ? '-100%' : pct < 0.3 ? '0' : '-50%'})`;
            wrap.classList.add('hovering');
            wrap.dataset.col = i;
            [...wrap.querySelectorAll('.col')].forEach((c, j) => c.classList.toggle('focus', j === i));
          },
        }));
    });

    const chartSvg = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Tasks done per day' }, grid, bars);
    chartSvg.addEventListener('mouseleave', () => { tip.hidden = true; wrap.classList.remove('hovering'); });
    wrap.append(chartSvg, tip);
    return wrap;
  }

  // Bar with rounded top corners, square at the baseline.
  function barPath(x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt);
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }

  function dayTable(days) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Day'), h('th', { class: 'num' }, 'Queued'), h('th', { class: 'num' }, 'Done'), h('th', { class: 'num' }, 'Measured time'))),
      h('tbody', {}, [...days].reverse().map((d) => h('tr', {},
        h('td', {}, Dates.long(d.date)),
        h('td', { class: 'num' }, String(d.queue.length)),
        h('td', { class: 'num' }, String(d.entries.length)),
        h('td', { class: 'num' }, fmtMin(d.entries.reduce((m, e) => m + (e.actual ?? 0), 0) || null)))))));
  }

  function taskTable(days) {
    const names = new Map(App.state.tasks.map((t) => [t.id, t]));
    const rows = new Map();
    const row = (id) => {
      if (!rows.has(id)) rows.set(id, { id, queued: 0, done: 0, actuals: [], last: null, name: names.get(id)?.name, est: names.get(id)?.minutes });
      return rows.get(id);
    };
    for (const d of days) {
      for (const id of d.queue) row(id).queued++;
      for (const e of d.entries) {
        const r = row(e.id);
        r.done++;
        r.name = r.name || e.name;
        r.est = r.est ?? e.minutes;
        if (e.actual != null) r.actuals.push(e.actual);
        r.last = d.date;
      }
    }
    const list = [...rows.values()].filter((r) => r.name).sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));
    if (!list.length) return h('p', { class: 'empty' }, 'No history in this range yet.');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Task'), h('th', { class: 'num' }, 'Done'), h('th', { class: 'num' }, 'Rate'),
        h('th', { class: 'num' }, 'Typical time'), h('th', { class: 'num' }, 'Estimate'), h('th', { class: 'num' }, 'Last done'))),
      h('tbody', {}, list.map((r) => h('tr', {},
        h('td', {}, r.name),
        h('td', { class: 'num' }, String(r.done)),
        h('td', { class: 'num' }, r.queued ? `${Math.round((Math.min(r.done, r.queued) / r.queued) * 100)}%` : '—'),
        h('td', { class: 'num' }, fmtMin(median(r.actuals))),
        h('td', { class: 'num' }, r.est != null ? `${r.est}m` : '—'),
        h('td', { class: 'num' }, r.last ? Dates.short(r.last) : '—'))))));
  }

  function todayLog(day) {
    if (!day.entries.length) return h('p', { class: 'empty' }, 'Nothing done yet today.');
    return h('ul', { class: 'log' }, [...day.entries].sort((a, b) => a.at - b.at).map((e) => h('li', {},
      h('span', { class: 'log-time' }, timeOf(e.at)),
      h('span', { class: 'log-name' }, e.name),
      h('span', { class: 'muted' }, e.actual != null ? `${fmtMin(e.actual)} (est ${e.minutes}m)` : `est ${e.minutes}m`))));
  }

  return { render };
})();
