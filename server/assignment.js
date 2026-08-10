/* Zuteilung auf der Datenbank. Die Regeln selbst stehen in #shared/assignment.js
   und werden vom Frontend, vom Server und von den Tests gemeinsam benutzt. */

import { HORIZON_DAYS, extendSeriesDates, runAssignmentPass } from "#shared/assignment.js";
import { addDays, startOfToday } from "#shared/dates.js";
import { readAccountsForLogic, readShiftsForLogic } from "./db.js";
import { uid } from "./ids.js";

export function assignmentDayOf(db, companyId) {
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
  const before = readShiftsForLogic(db, companyId);
  const accounts = readAccountsForLogic(db, companyId);
  const after = runAssignmentPass(before, accounts, today, assignmentDayOf(db, companyId), forceIds);

  const setShift = db.prepare("UPDATE shifts SET assignment_attempted = ?, assigned_at = ? WHERE id = ?");
  const setAssigned = db.prepare("UPDATE enrollments SET assigned = 1 WHERE shift_id = ? AND account_id = ?");

  db.transaction(() => {
    after.forEach((shift, i) => {
      const old = before[i];
      if (shift.assignmentAttempted !== old.assignmentAttempted || shift.assignedAt !== old.assignedAt) {
        setShift.run(shift.assignmentAttempted ? 1 : 0, shift.assignedAt, shift.id);
      }
      for (const accountId of shift.assigned) {
        if (!old.assigned.includes(accountId)) setAssigned.run(shift.id, accountId);
      }
    });
  })();
}

/** Zuteilungslauf über alle Firmen — vom Scheduler einmal täglich benutzt. */
export function recomputeAll(db) {
  for (const { id } of db.prepare("SELECT id FROM companies").all()) recompute(db, id);
}

/**
 * Füllt wiederkehrende Serien (alle ausser "once") auf den aktuellen
 * Horizont auf. Ohne das würde jede Serie HORIZON_DAYS nach ihrem Anlegen
 * unbemerkt auslaufen, statt wie gedacht dauerhaft weiterzulaufen.
 */
export function extendSeries(db) {
  const horizon = addDays(startOfToday(), HORIZON_DAYS);
  const series = db
    .prepare(
      `SELECT series_id, company_id, name, start_time, end_time, repeat, seats,
              qualification_id, end_date, MAX(date) AS last_date
         FROM shifts
        WHERE repeat != 'once'
        GROUP BY series_id`
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                          repeat, seats, qualification_id, end_date, assignment_attempted, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
  );

  db.transaction(() => {
    for (const s of series) {
      const newDates = extendSeriesDates(s.repeat, s.last_date, s.end_date, horizon);
      for (const date of newDates) {
        insert.run(
          uid("s"), s.company_id, s.series_id, s.name, date,
          s.start_time, s.end_time, s.repeat, s.seats, s.qualification_id, s.end_date
        );
      }
    }
  })();
}
