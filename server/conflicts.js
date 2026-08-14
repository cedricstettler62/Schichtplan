/* Wer eine Schicht übernimmt, kann in derselben Zeit keine zweite übernehmen.

   Das ist die Regel; gespeichert werden nur die Ausnahmen davon. Legt die
   Administration eine Schicht an, die sich mit einer bestehenden überschneidet,
   entscheidet sie einmal je Serie, ob sich beide zusammen übernehmen lassen —
   etwa weil sie am selben Ort stattfinden. Nur dieses "ja" landet in der
   Tabelle. Alles, worüber nie entschieden wurde, schliesst sich aus. */

import { shiftsOverlap } from "#shared/overlap.js";
import { addDays, fromISO, toISO } from "#shared/dates.js";

import { toShift } from "./db.js";

/** Reihenfolgeunabhängig ablegen, sonst fände die Abfrage das Paar nur halb. */
function paar(a, b) {
  return a <= b ? [a, b] : [b, a];
}

/** Hält fest, dass sich zwei Serien trotz Überschneidung zusammen übernehmen lassen. */
export function merkeKombinierbar(db, companyId, seriesA, seriesB) {
  const [a, b] = paar(seriesA, seriesB);
  db.prepare(
    "INSERT OR IGNORE INTO combinable_series (company_id, series_a, series_b) VALUES (?, ?, ?)"
  ).run(companyId, a, b);
}

/** Nimmt eine Freigabe zurück: Die beiden Serien schliessen einander wieder aus. */
export function vergissKombinierbar(db, companyId, seriesA, seriesB) {
  const [a, b] = paar(seriesA, seriesB);
  db.prepare(
    "DELETE FROM combinable_series WHERE company_id = ? AND series_a = ? AND series_b = ?"
  ).run(companyId, a, b);
}

export function istKombinierbar(db, companyId, seriesA, seriesB) {
  const [a, b] = paar(seriesA, seriesB);
  return !!db
    .prepare("SELECT 1 FROM combinable_series WHERE company_id = ? AND series_a = ? AND series_b = ?")
    .get(companyId, a, b);
}

/**
 * Die Schicht, die einer Übernahme von `shift` im Weg steht — oder null.
 *
 * Gesucht wird nur im Umkreis eines Tages: Weiter kann keine Überschneidung
 * reichen, auch nicht über Mitternacht hinweg.
 */
export function findeKonflikt(db, companyId, accountId, shift) {
  const tag = fromISO(shift.date);
  const von = toISO(addDays(tag, -1));
  const bis = toISO(addDays(tag, 1));

  const kandidaten = db
    .prepare(
      `SELECT s.* FROM shifts s
         JOIN enrollments e ON e.shift_id = s.id
        WHERE e.account_id = ? AND s.company_id = ? AND s.id != ? AND s.date BETWEEN ? AND ?`
    )
    .all(accountId, companyId, shift.id, von, bis)
    .map((row) => toShift(db, row));

  for (const andere of kandidaten) {
    if (!shiftsOverlap(shift, andere)) continue;
    if (istKombinierbar(db, companyId, shift.seriesId, andere.seriesId)) continue;
    return andere;
  }
  return null;
}

/** Die Meldung, die beim Einschreiben erscheint — sie muss beide Schichten nennen. */
export function konfliktMeldung(shift, andere) {
  return `„${andere.name}“ (${andere.startTime}–${andere.endTime}) und „${shift.name}“ (${shift.startTime}–${shift.endTime}) überschneiden sich und lassen sich nicht gleichzeitig übernehmen.`;
}
