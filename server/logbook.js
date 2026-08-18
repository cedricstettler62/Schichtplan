/* Logbuch: unveränderlicher Audit-Trail für Schichten (anlegen, ändern,
   zu-/umteilen, Hilfegesuche) plus die Einsichtsanfragen von Mitarbeitenden
   dazu. Jede Schreibstelle im Rest des Servers ruft nur eine der log*-
   Funktionen hier auf, statt selbst SQL für logbook_entries zu schreiben —
   damit bleibt "nur INSERT, nie UPDATE/DELETE" an einer einzigen Stelle
   sichergestellt. */

import { uid } from "./ids.js";

export function shiftLabel(shift) {
  return `${shift.name} · ${shift.date} ${shift.startTime}–${shift.endTime}`;
}

function insert(db, { companyId, shift, type, message, actorAccountId = null, targetAccountId = null }) {
  db.prepare(
    `INSERT INTO logbook_entries
       (id, company_id, shift_id, shift_label, type, message, actor_account_id, target_account_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uid("log"), companyId, shift.id, shiftLabel(shift), type, message,
    actorAccountId, targetAccountId, new Date().toISOString()
  );
}

export function logShiftCreated(db, companyId, shift, actorName, actorAccountId) {
  insert(db, {
    companyId, shift, type: "created",
    message: `Schicht angelegt von ${actorName}.`,
    actorAccountId,
  });
}

export function logShiftUpdated(db, companyId, shift, actorName, actorAccountId) {
  insert(db, {
    companyId, shift, type: "updated",
    message: `Schicht bearbeitet von ${actorName}.`,
    actorAccountId,
  });
}

/** `actorName` = null heisst: automatische Zuteilung (Auslosung/Scheduler), kein Zutun einer Person. */
export function logAssigned(db, companyId, shift, targetName, targetAccountId, actorName = null, actorAccountId = null) {
  insert(db, {
    companyId, shift, type: "assigned",
    message: actorName
      ? `${targetName} wurde von ${actorName} zugeteilt.`
      : `${targetName} wurde automatisch zugeteilt.`,
    actorAccountId, targetAccountId,
  });
}

export function logUnassigned(db, companyId, shift, targetName, targetAccountId, actorName, actorAccountId, grund = "ausgetragen") {
  insert(db, {
    companyId, shift, type: "unassigned",
    message: `${targetName} wurde von ${actorName} ${grund}.`,
    actorAccountId, targetAccountId,
  });
}

export function logReassigned(db, companyId, shift, newName, newAccountId, oldName = null) {
  insert(db, {
    companyId, shift, type: "reassigned",
    message: oldName
      ? `${newName} hat die Schicht von ${oldName} übernommen.`
      : `${newName} hat eine offene Schicht übernommen.`,
    actorAccountId: newAccountId, targetAccountId: newAccountId,
  });
}

export function logHelp(db, companyId, shift, actorName, actorAccountId, requested) {
  insert(db, {
    companyId, shift,
    type: requested ? "help_requested" : "help_withdrawn",
    message: requested
      ? `${actorName} hat ein Hilfegesuch gestellt.`
      : `${actorName} hat das Hilfegesuch zurückgezogen.`,
    actorAccountId, targetAccountId: actorAccountId,
  });
}

/* --- Lesen --- */

function mapEntry(r) {
  return {
    id: r.id,
    shiftId: r.shift_id,
    shiftLabel: r.shift_label,
    type: r.type,
    message: r.message,
    actorAccountId: r.actor_account_id,
    targetAccountId: r.target_account_id,
    createdAt: r.created_at,
  };
}

export function readLogbook(db, companyId, { shiftId } = {}) {
  const rows = shiftId
    ? db.prepare("SELECT * FROM logbook_entries WHERE company_id = ? AND shift_id = ? ORDER BY created_at DESC")
        .all(companyId, shiftId)
    : db.prepare("SELECT * FROM logbook_entries WHERE company_id = ? ORDER BY created_at DESC").all(companyId);
  return rows.map(mapEntry);
}

/**
 * Schichten, für die `accountId` in der Vergangenheit eingetragen war — ganz
 * gleich, ob am Ende zugeteilt oder nicht. `enrollments` allein reicht dafür
 * nicht: Wer die Auslosung verliert oder ausgetragen wird, verschwindet dort
 * wieder. Das Logbuch selbst ist die einzige Stelle, die das noch weiss.
 */
export function readInvolvedPastShifts(db, companyId, accountId, todayISO) {
  return db
    .prepare(
      `SELECT DISTINCT s.id, s.name, s.date, s.start_time AS startTime, s.end_time AS endTime
         FROM shifts s
        WHERE s.company_id = ? AND s.date < ?
          AND (
            EXISTS (SELECT 1 FROM enrollments e WHERE e.shift_id = s.id AND e.account_id = ?)
            OR EXISTS (
              SELECT 1 FROM logbook_entries l
               WHERE l.shift_id = s.id AND (l.actor_account_id = ? OR l.target_account_id = ?)
            )
          )
        ORDER BY s.date DESC`
    )
    .all(companyId, todayISO, accountId, accountId, accountId);
}

export function hasApprovedAccess(db, companyId, accountId, shiftId) {
  return !!db
    .prepare(
      `SELECT 1 FROM logbook_access_requests
        WHERE company_id = ? AND account_id = ? AND shift_id = ? AND status = 'approved'`
    )
    .get(companyId, accountId, shiftId);
}

export function hasOpenAccessRequest(db, companyId, accountId, shiftId) {
  return !!db
    .prepare(
      `SELECT 1 FROM logbook_access_requests
        WHERE company_id = ? AND account_id = ? AND shift_id = ? AND status IN ('pending', 'approved')`
    )
    .get(companyId, accountId, shiftId);
}

export function createAccessRequest(db, { companyId, accountId, shift, note }) {
  const id = uid("lar");
  db.prepare(
    `INSERT INTO logbook_access_requests (id, company_id, shift_id, shift_label, account_id, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, companyId, shift.id, shiftLabel(shift), accountId, note || null, new Date().toISOString());
  return id;
}

export function decideAccessRequest(db, { id, companyId, status }) {
  const info = db
    .prepare(
      `UPDATE logbook_access_requests SET status = ?, decided_at = ?
        WHERE id = ? AND company_id = ? AND status = 'pending'`
    )
    .run(status, new Date().toISOString(), id, companyId);
  return info.changes > 0;
}
