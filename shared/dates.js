/* Datumshilfen. Ganze Anwendung rechnet mit ISO-Strings "YYYY-MM-DD". */

export function pad(n) { return String(n).padStart(2, "0"); }

export function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function fromISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }

export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

/** Monate verschieben, ohne in den Folgemonat zu rutschen: 31.5. − 3 Monate = 28./29.2. */
export function addMonths(d, n) {
  const r = new Date(d);
  const tag = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const letzter = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(tag, letzter));
  return r;
}

export function fmtDate(iso) {
  const d = fromISO(iso);
  const wd = d.toLocaleDateString("de-DE", { weekday: "short" });
  return `${wd}. ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function shortDay(iso) { const d = fromISO(iso); return pad(d.getDate()); }

export function shortMonth(iso) { const d = fromISO(iso); return d.toLocaleDateString("de-DE", { month: "short" }).replace(".", ""); }

export function shortWeekday(iso) { const d = fromISO(iso); return d.toLocaleDateString("de-DE", { weekday: "short" }); }

export function monthDiff(from, to) { return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()); }

export function isFutureOrToday(iso, today) { return iso >= toISO(today); }

/** Heutiges Datum, auf Mitternacht normalisiert. */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Zeitstempel für Dateinamen: 2026-08-19_1435. */
export function zeitstempel(d = new Date()) {
  return `${toISO(d)}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
