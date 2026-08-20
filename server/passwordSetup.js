/* Der Link, mit dem eine neu angelegte Person ihr eigenes erstes Passwort
   setzt — Gegenstück zu server/mail.js: Hier entsteht das Zeichen, dort geht
   die Mail damit raus.

   Ein Admin gibt beim Anlegen kein Passwort mehr vor (server/routes/company.js,
   POST /employees). Stattdessen bekommt das Konto ein zufälliges, niemandem
   bekanntes, und diese Datei erzeugt den einmal einlösbaren Link dazu. */

import crypto from "node:crypto";

/* Eine Woche Zeit, den Link zu öffnen — reicht über ein verlängertes
   Wochenende oder eine kurze Abwesenheit hinweg, ohne dass ein sehr alter
   Link noch gültig wäre. */
const GUELTIGKEIT_MS = 7 * 24 * 60 * 60 * 1000;

/** Erzeugt einen neuen Link-Token für `accountId` und legt ihn ab. */
export function erstelleSetupToken(db, accountId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const jetzt = new Date();
  db.prepare(
    "INSERT INTO password_resets (token, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(token, accountId, new Date(jetzt.getTime() + GUELTIGKEIT_MS).toISOString(), jetzt.toISOString());
  return token;
}

/**
 * Das Konto zu einem Token — oder null, wenn es das Zeichen nicht gibt oder
 * seine Frist verstrichen ist. Liest nur, löscht nichts: Die Seite hinter dem
 * Link fragt das für die Begrüssung ab, bevor überhaupt ein Passwort eingegeben ist.
 */
export function leseSetupToken(db, token) {
  const row = db
    .prepare(
      `SELECT pr.account_id AS accountId, pr.expires_at AS expiresAt,
              a.name AS accountName, a.company_id AS companyId, c.name AS companyName
         FROM password_resets pr
         JOIN accounts a ON a.id = pr.account_id
         JOIN companies c ON c.id = a.company_id
        WHERE pr.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;
  return row;
}

/** Räumt alle offenen Links eines Kontos weg — nach dem Einlösen, oder wenn
 *  ein Admin von Hand ein neues Passwort setzt und der alte Link damit
 *  überholt ist. */
export function verwirfSetupTokens(db, accountId) {
  db.prepare("DELETE FROM password_resets WHERE account_id = ?").run(accountId);
}
