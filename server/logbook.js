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

/**
 * Die eine Schreibstelle. `subjectLabel` ist meist eine Schicht
 * (shiftLabel(shift)), bei Kontoänderungen ohne Schicht der Name des
 * betroffenen Kontos — beides beantwortet dieselbe Frage: worum es in dieser
 * Zeile geht.
 */
function insert(db, companyId, type, subjectLabel, message, { shiftId = null, actorAccountId = null, targetAccountId = null } = {}) {
  db.prepare(
    `INSERT INTO logbook_entries
       (id, company_id, shift_id, shift_label, type, message, actor_account_id, target_account_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uid("log"), companyId, shiftId, subjectLabel, type, message,
    actorAccountId, targetAccountId, new Date().toISOString()
  );
}

/** Eintrag zu einer Schicht — Beschriftung und shift_id kommen aus ihr selbst. */
function zurSchicht(db, companyId, shift, type, message, ids = {}) {
  insert(db, companyId, type, shiftLabel(shift), message, { shiftId: shift.id, ...ids });
}

export function logShiftCreated(db, companyId, shift, actorName, actorAccountId) {
  zurSchicht(db, companyId, shift, "created", `Schicht angelegt von ${actorName}.`, { actorAccountId });
}

export function logShiftUpdated(db, companyId, shift, actorName, actorAccountId) {
  zurSchicht(db, companyId, shift, "updated", `Schicht bearbeitet von ${actorName}.`, { actorAccountId });
}

/**
 * Eine gelöschte Schicht. Der Eintrag entsteht vor dem Löschen — danach nimmt
 * der Fremdschlüssel auf shifts die Zeile nicht mehr an, und shift_id fällt
 * beim Löschen ohnehin auf NULL. Was bleibt, ist die Beschriftung: Ohne sie
 * verschwände eine Schicht spurlos, und gerade beim Löschen ist die Spur das
 * Einzige, was übrig bleibt.
 */
export function logShiftDeleted(db, companyId, shift, actorName, actorAccountId) {
  zurSchicht(db, companyId, shift, "deleted", `Schicht gelöscht von ${actorName}.`, { actorAccountId });
}

/** `actorName` = null heisst: automatische Zuteilung (Auslosung/Scheduler), kein Zutun einer Person. */
export function logAssigned(db, companyId, shift, targetName, targetAccountId, actorName = null, actorAccountId = null) {
  zurSchicht(
    db, companyId, shift, "assigned",
    actorName ? `${targetName} wurde von ${actorName} zugeteilt.` : `${targetName} wurde automatisch zugeteilt.`,
    { actorAccountId, targetAccountId }
  );
}

export function logUnassigned(db, companyId, shift, targetName, targetAccountId, actorName, actorAccountId, grund = "ausgetragen") {
  zurSchicht(db, companyId, shift, "unassigned", `${targetName} wurde von ${actorName} ${grund}.`, {
    actorAccountId, targetAccountId,
  });
}

export function logReassigned(db, companyId, shift, newName, newAccountId, oldName = null) {
  zurSchicht(
    db, companyId, shift, "reassigned",
    oldName ? `${newName} hat die Schicht von ${oldName} übernommen.` : `${newName} hat eine offene Schicht übernommen.`,
    { actorAccountId: newAccountId, targetAccountId: newAccountId }
  );
}

export function logHelp(db, companyId, shift, actorName, actorAccountId, requested) {
  zurSchicht(
    db, companyId, shift, requested ? "help_requested" : "help_withdrawn",
    requested ? `${actorName} hat ein Hilfegesuch gestellt.` : `${actorName} hat das Hilfegesuch zurückgezogen.`,
    { actorAccountId, targetAccountId: actorAccountId }
  );
}

/**
 * Änderung an einem Konto, die sich gefahrlos mit altem und neuem Stand
 * protokollieren lässt (Rolle, Qualifikation — nicht das Passwort, siehe
 * logPasswordChanged). `message` ist ein fertiger Satz mit altem und neuem
 * Wert, analog zu den übrigen Logbuch-Einträgen.
 */
export function logAccountChanged(db, companyId, { accountName, accountId, message, actorAccountId = null }) {
  insert(db, companyId, "account_updated", accountName, message, { actorAccountId, targetAccountId: accountId });
}

/**
 * Passwortänderung — bewusst ohne altes oder neues Passwort, nur wessen
 * Konto es betrifft, wer es geändert hat und wann (created_at). Ein Admin
 * erfährt dadurch nie ein fremdes Passwort, aber jede Änderung an einem
 * Mitarbeitendenkonto steht sichtbar im Logbuch.
 */
export function logPasswordChanged(db, companyId, { accountName, accountId, actorName, actorAccountId = null, selbst }) {
  insert(
    db, companyId, "password_changed", accountName,
    selbst ? "Eigenes Passwort geändert." : `Passwort geändert durch ${actorName}.`,
    { actorAccountId, targetAccountId: accountId }
  );
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
  return db
    .prepare(
      `SELECT * FROM logbook_entries
        WHERE company_id = ?${shiftId ? " AND shift_id = ?" : ""}
        ORDER BY created_at DESC`
    )
    .all(...(shiftId ? [companyId, shiftId] : [companyId]))
    .map(mapEntry);
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

/** Liegt für diese Schicht eine Anfrage in einem dieser Zustände vor? */
function hatAnfrage(db, companyId, accountId, shiftId, status) {
  return !!db
    .prepare(
      `SELECT 1 FROM logbook_access_requests
        WHERE company_id = ? AND account_id = ? AND shift_id = ?
          AND status IN (${status.map(() => "?").join(", ")})`
    )
    .get(companyId, accountId, shiftId, ...status);
}

export const hasApprovedAccess = (db, companyId, accountId, shiftId) =>
  hatAnfrage(db, companyId, accountId, shiftId, ["approved"]);

/** Eine offene oder bereits genehmigte Anfrage — beides schliesst eine zweite aus. */
export const hasOpenAccessRequest = (db, companyId, accountId, shiftId) =>
  hatAnfrage(db, companyId, accountId, shiftId, ["pending", "approved"]);

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
