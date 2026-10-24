// Scheduling logic carried over from the spreadsheet:
//  - the daily shuffle (todo sheet, "helper1" column)
//  - the rotating work schedule (week sheet, row 3)
const Schedule = (() => {
  // Fractional part of |sin(seed)|: a stable pseudo-random number in [0, 1)
  // that changes every day and differs per task name.
  function jitter(name, serial) {
    let codes = 0;
    for (const ch of name) codes += ch.charCodeAt(0);
    const x = Math.abs(Math.sin((serial * 1000 + codes) * 12345.6789));
    return x - Math.floor(x);
  }

  // Dailies with rank < 10 are priorities: they keep roughly their rank but
  // wobble by up to ±1.5 so the order isn't identical every day. Rank 10+
  // are optional and get dropped somewhere random among the priorities.
  function dailyOrder(dailies, date) {
    const serial = Dates.excelSerial(date);
    const isPriority = (d) => Number(d.rank) < 10;

    const priority = dailies.filter(isPriority).map((d) => ({
      ...d,
      priority: true,
      score: Number(d.rank) + (jitter(d.name, serial) - 0.5) * 3,
    }));

    const scores = priority.map((d) => d.score);
    const lo = scores.length ? Math.min(...scores) - 1 : 0;
    const hi = scores.length ? Math.max(...scores) + 1 : 10;

    const optional = dailies.filter((d) => !isPriority(d)).map((d) => ({
      ...d,
      priority: false,
      score: lo + jitter(d.name, serial) * (hi - lo),
    }));

    return [...priority, ...optional].sort((a, b) => a.score - b.score);
  }

  function isWorkDay(date, settings) {
    return settings.workDays.includes(Dates.weekday(date)) && !settings.offDays.includes(date);
  }

  // Which period of the rotation a date falls on. The rotation only moves
  // forward on work days, so weekends and days off don't use up a period.
  function rotation(date, settings) {
    if (!isWorkDay(date, settings)) return null;
    const { rotationAnchor: anchor, anchorPeriod, cycleLength } = settings;
    const span = Dates.diffDays(anchor, date);
    let n = 0;
    if (span >= 0) {
      // work days in (anchor, date]
      for (let i = 1; i <= span; i++) if (isWorkDay(Dates.addDays(anchor, i), settings)) n++;
    } else {
      // work days in [date, anchor)
      for (let i = 0; i < -span; i++) if (isWorkDay(Dates.addDays(date, i), settings)) n--;
    }
    const len = Math.max(1, cycleLength);
    return ((((anchorPeriod - 1 + n) % len) + len) % len) + 1;
  }

  // Streak = consecutive days the daily was done, counting back from today
  // (or from yesterday, if today isn't done yet).
  function streak(dailyId, log, today) {
    const doneOn = (d) => (log[d] || []).includes(dailyId);
    let day = doneOn(today) ? today : Dates.addDays(today, -1);
    let count = 0;
    while (doneOn(day)) {
      count++;
      day = Dates.addDays(day, -1);
    }
    return count;
  }

  return { dailyOrder, isWorkDay, rotation, streak };
})();
