/* Ein Konto löschen — an zwei Stellen nötig (die Firma selbst, die Verwaltung)
   und beide Male mit derselben Sorgfalt: Schichten, die das Konto besetzt hat,
   dürfen nicht still an die nächstbeste eingeschriebene Person weiterwandern,
   sondern sollen sichtbar unter „Noch offene Plätze“ auftauchen. */

import { recomputeAndNotify, releaseSeats } from "./assignment.js";
import { toShift } from "./db.js";
import { logUnassigned } from "./logbook.js";

/**
 * Löscht `target` und gibt seine Zuteilungen frei.
 *
 * `nachfolgerId` befördert im selben Zug ein anderes Konto zur Administration —
 * beim letzten Admin-Konto einer Firma ist das Pflicht, sonst stünde sie ohne
 * Verwaltung da.
 */
export function loescheKonto(db, companyId, target, { actorName, actorAccountId = null, nachfolgerId = null, config }) {
  // Die Zuordnung muss vor dem Löschen gelesen werden, danach hat das Schema
  // sie weggeräumt.
  const frei = db
    .prepare("SELECT shift_id FROM enrollments WHERE account_id = ? AND assigned = 1")
    .all(target.id)
    .map((r) => r.shift_id);
  const freiRows = frei.length
    ? db.prepare(`SELECT * FROM shifts WHERE id IN (${frei.map(() => "?").join(", ")})`).all(...frei)
    : [];

  db.transaction(() => {
    if (nachfolgerId) db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?").run(nachfolgerId);
    // Vor dem Löschen protokollieren: actor_account_id/target_account_id sind
    // Fremdschlüssel und würden ein bereits gelöschtes Konto ablehnen.
    for (const row of freiRows) {
      logUnassigned(
        db, companyId, toShift(db, row), target.name, target.id,
        actorName, actorAccountId, "wegen Kontolöschung ausgetragen"
      );
    }
    db.prepare("DELETE FROM accounts WHERE id = ?").run(target.id);
  })();

  releaseSeats(db, frei);
  recomputeAndNotify(db, config, companyId);
}
