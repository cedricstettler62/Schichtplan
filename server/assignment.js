/* Zuteilung auf der Datenbank. Die Regeln selbst stehen in #shared/assignment.js
   und werden vom Frontend, vom Server und von den Tests gemeinsam benutzt. */

import { HORIZON_DAYS, extendSeriesDates, runAssignmentPass } from "#shared/assignment.js";
import { addDays, addMonths, startOfToday, toISO } from "#shared/dates.js";
import { paarSchluessel, shiftsOverlap } from "#shared/overlap.js";
import { raeumeFreigaben } from "./conflicts.js";
import { readAccountsForLogic, readShifts } from "./db.js";
import { uid } from "./ids.js";
import { logAssigned } from "./logbook.js";

/**
 * Wann sich zwei Schichten gegenseitig ausschliessen: wenn sie sich zeitlich
 * überschneiden und ihre Serien nicht ausdrücklich als zusammen übernehmbar
 * eingetragen sind.
 *
 * Dieselbe Regel gilt beim Einschreiben. Sie hier zu wiederholen ist trotzdem
 * nötig: Eine Freigabe kann zurückgenommen werden, nachdem sich jemand für
 * beide eingeschrieben hat — dann steht die Einschreibung schon da und nur die
 * Auslosung kann noch verhindern, dass daraus zwei Zuteilungen werden.
 */
function ausschlussRegel(db, companyId) {
  const freigegeben = new Set(
    db.prepare("SELECT series_a, series_b FROM combinable_series WHERE company_id = ?")
      .all(companyId)
      .map((r) => `${r.series_a}|${r.series_b}`)
  );
  return (a, b) => shiftsOverlap(a, b) && !freigegeben.has(paarSchluessel(a.seriesId, b.seriesId));
}

function assignmentDayOf(db, companyId) {
  const row = db.prepare("SELECT assignment_day FROM companies WHERE id = ?").get(companyId);
  return row ? row.assignment_day : 7;
}

/**
 * Führt einen Zuteilungslauf für eine Firma aus und schreibt nur das zurück,
 * was sich tatsächlich geändert hat. `today` kommt pro Aufruf frisch — anders
 * als im Browser, wo ein lange offener Tab mit gestern rechnete.
 */
export function recompute(db, companyId, forceIds = []) {
  const today = startOfToday();
  const before = readShifts(db, companyId);
  const accounts = readAccountsForLogic(db, companyId);
  const after = runAssignmentPass(
    before, accounts, today, assignmentDayOf(db, companyId), forceIds,
    Math.random, ausschlussRegel(db, companyId)
  );

  const setShift = db.prepare("UPDATE shifts SET assignment_attempted = ?, assigned_at = ? WHERE id = ?");
  const setAssigned = db.prepare("UPDATE enrollments SET assigned = 1 WHERE shift_id = ? AND account_id = ?");
  const warteliste = db.prepare("DELETE FROM enrollments WHERE shift_id = ? AND assigned = 0");
  /* Für die Logbuch-Meldung — readAccountsForLogic liefert keine Namen, die
     braucht nur die Zuteilungslogik selbst nicht. */
  const namen = new Map(
    db.prepare("SELECT id, name FROM accounts WHERE company_id = ?").all(companyId).map((a) => [a.id, a.name])
  );

  db.transaction(() => {
    after.forEach((shift, i) => {
      const old = before[i];
      if (shift.assignmentAttempted !== old.assignmentAttempted || shift.assignedAt !== old.assignedAt) {
        setShift.run(shift.assignmentAttempted ? 1 : 0, shift.assignedAt, shift.id);
      }
      for (const accountId of shift.assigned) {
        if (!old.assigned.includes(accountId)) {
          setAssigned.run(shift.id, accountId);
          logAssigned(db, companyId, shift, namen.get(accountId) || "Unbekannt", accountId);
        }
      }
      /* Mit der Auslosung hat die Warteliste ihren Zweck erfüllt: Wer keine
         Zusage bekommen hat, soll die Schicht nicht weiter unter "Meine
         Schichten" mitschleppen. Ein noch freier Platz geht ohnehin an die
         nächste Person, die sich einschreibt. Erst zuteilen, dann räumen. */
      if (shift.assignmentAttempted && !old.assignmentAttempted) warteliste.run(shift.id);
    });
  })();
}

/** Zuteilungslauf über alle Firmen — vom Scheduler einmal täglich benutzt. */
export function recomputeAll(db) {
  for (const { id } of db.prepare("SELECT id FROM companies").all()) recompute(db, id);
}

/**
 * Gibt Plätze frei: Die Schicht gilt danach als ausgelost und offen geblieben
 * und erscheint unter "Noch offene Plätze". Weil die Auslosung nur einmal
 * stattfindet, besetzt die Automatik den Platz nicht nach — er geht an die
 * erste Person, die sich einschreibt oder übernimmt.
 *
 * Bleibt niemand zugeteilt, fällt auch das Zuteilungsdatum weg, sonst zeigte
 * die nächste zugeteilte Person ein Datum von vor ihrer eigenen Zuteilung.
 */
export function releaseSeats(db, shiftIds) {
  if (shiftIds.length === 0) return;
  const stmt = db.prepare(
    `UPDATE shifts
        SET assignment_attempted = 1,
            assigned_at = CASE
              WHEN EXISTS (SELECT 1 FROM enrollments WHERE shift_id = shifts.id AND assigned = 1)
              THEN assigned_at ELSE NULL END
      WHERE id = ?`
  );
  db.transaction(() => { for (const id of shiftIds) stmt.run(id); })();
}

/**
 * Entfernt Schichten, die länger als `monate` vorbei sind — samt
 * Einschreibungen und Hilfegesuchen, die das Schema mitlöscht.
 *
 * Verschwindet dabei die letzte Schicht einer Serie, geht ihre Freigabe mit:
 * Für Serien-IDs gibt es keinen Fremdschlüssel, der das erledigen könnte.
 */
export function purgeOldShifts(db, monate = 60) {
  const grenze = toISO(addMonths(startOfToday(), -monate));
  const geloescht = db.prepare("DELETE FROM shifts WHERE date < ?").run(grenze).changes;
  if (geloescht > 0) raeumeFreigaben(db);
  return geloescht;
}

/**
 * Füllt wiederkehrende Serien (alle ausser "once") auf den aktuellen
 * Horizont auf. Ohne das würde jede Serie HORIZON_DAYS nach ihrem Anlegen
 * unbemerkt auslaufen, statt wie gedacht dauerhaft weiterzulaufen.
 */
export function extendSeries(db) {
  const today = startOfToday();
  const horizon = addDays(today, HORIZON_DAYS);
  /* MAX(date) zieht in SQLite die übrigen Spalten aus genau der Zeile mit dem
     höchsten Datum — die nachgefüllten Termine erben also den zuletzt gültigen
     Stand der Serie, nicht irgendeinen. `last_id` deshalb mit: An ihr hängen
     die Qualifikationen, die die neuen Termine übernehmen sollen. */
  const series = db
    .prepare(
      `SELECT series_id, company_id, name, start_time, end_time, repeat, seats,
              end_date, id AS last_id, MAX(date) AS last_date
         FROM shifts
        WHERE repeat != 'once'
        GROUP BY series_id`
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                          repeat, seats, end_date, assignment_attempted, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
  );
  const anforderungen = db.prepare("SELECT qualification_id FROM shift_qualifications WHERE shift_id = ?");
  const merkeAnforderung = db.prepare(
    "INSERT INTO shift_qualifications (shift_id, qualification_id) VALUES (?, ?)"
  );

  db.transaction(() => {
    for (const s of series) {
      const newDates = extendSeriesDates(s.repeat, s.last_date, s.end_date, horizon, today);
      if (newDates.length === 0) continue;
      const quals = anforderungen.all(s.last_id).map((r) => r.qualification_id);

      for (const date of newDates) {
        const id = uid("s");
        insert.run(
          id, s.company_id, s.series_id, s.name, date,
          s.start_time, s.end_time, s.repeat, s.seats, s.end_date
        );
        for (const qualId of quals) merkeAnforderung.run(id, qualId);
      }
    }
  })();
}
