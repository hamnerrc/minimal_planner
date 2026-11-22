// Date helpers. All dates are handled as local "YYYY-MM-DD" strings so
// nothing shifts around when the timezone or daylight-saving time changes.
const Dates = (() => {
  const DAY_MS = 86400000;
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const pad = (n) => String(n).padStart(2, '0');

  function iso(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function today() {
    return iso(new Date());
  }

  function addDays(s, n) {
    const d = parse(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  }

  // Whole days from a to b (positive when b is later).
  function diffDays(a, b) {
    return Math.round((parse(b) - parse(a)) / DAY_MS);
  }

  // Same day numbering the spreadsheet used (days since 1899-12-30), so the
  // daily shuffle is seeded the same way.
  function excelSerial(s) {
    return Math.round((parse(s) - new Date(1899, 11, 30)) / DAY_MS);
  }

  function weekday(s) {
    return parse(s).getDay();
  }

  function weekdayName(s) {
    return WEEKDAYS[weekday(s)];
  }

  function short(s) {
    const d = parse(s);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  // "Fri, Nov 27" (the year is added when it isn't this year)
  function long(s) {
    const d = parse(s);
    const year = d.getFullYear() === new Date().getFullYear() ? '' : `, ${d.getFullYear()}`;
    return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
  }

  // "today", "tomorrow", "in 5 days", "3 days ago"
  function friendly(s, from = today()) {
    const n = diffDays(from, s);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n < 0) return `${-n} days ago`;
    if (n < 14) return `in ${n} days`;
    if (n < 60) return `in ${Math.round(n / 7)} weeks`;
    return `in ${Math.round(n / 30)} months`;
  }

  // The next date after `from` that falls on weekday `wd` (0 = Sun).
  function nextWeekday(from, wd) {
    const n = ((wd - weekday(from) + 7) % 7) || 7;
    return addDays(from, n);
  }

  function relative(s, from = today()) {
    const n = diffDays(from, s);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n < 0) return `${-n}d overdue`;
    if (n < 14) return `in ${n}d`;
    return `in ${Math.round(n / 7)}w`;
  }

  function toMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function fromMinutes(min) {
    return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  }

  function clock(hhmm) {
    const min = toMinutes(hhmm);
    const h = Math.floor(min / 60);
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${pad(min % 60)} ${h < 12 ? 'am' : 'pm'}`;
  }

  return {
    iso, parse, today, addDays, diffDays, excelSerial, weekday, weekdayName,
    short, long, relative, friendly, nextWeekday, toMinutes, fromMinutes, clock, WEEKDAYS,
  };
})();
