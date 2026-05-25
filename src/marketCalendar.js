function partsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekdayName: parts.weekday,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    dateString: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nthWeekday(year, month, weekday, nth) {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return addDays(first, offset + (nth - 1) * 7);
}

function lastWeekday(year, month, weekday) {
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return addDays(last, -offset);
}

function observedFixedHoliday(year, month, day) {
  const date = utcDate(year, month, day);
  if (date.getUTCDay() === 6) return ymd(addDays(date, -1));
  if (date.getUTCDay() === 0) return ymd(addDays(date, 1));
  return ymd(date);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

function marketHolidays(year) {
  return new Set([
    observedFixedHoliday(year, 1, 1),
    ymd(nthWeekday(year, 1, 1, 3)),
    ymd(nthWeekday(year, 2, 1, 3)),
    ymd(addDays(easterSunday(year), -2)),
    ymd(lastWeekday(year, 5, 1)),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    ymd(nthWeekday(year, 9, 1, 1)),
    ymd(nthWeekday(year, 11, 4, 4)),
    observedFixedHoliday(year, 12, 25)
  ]);
}

function isRegularMarketOpenDate(dateString) {
  const date = utcDate(
    Number(dateString.slice(0, 4)),
    Number(dateString.slice(5, 7)),
    Number(dateString.slice(8, 10))
  );
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !marketHolidays(date.getUTCFullYear()).has(dateString);
}

module.exports = {
  partsInTimezone,
  isRegularMarketOpenDate,
  marketHolidays
};
