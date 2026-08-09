/* Datumshilfen. Ganze Anwendung rechnet mit ISO-Strings "YYYY-MM-DD". */

export function pad(n) { return String(n).padStart(2, "0"); }

export function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function fromISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }

export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

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
