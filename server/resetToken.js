/* Einmal-Token für „Passwort setzen“ — benutzt vom Passwort-vergessen-Ablauf
   und von der Einladung eines frisch angelegten Kontos.

   In der Datenbank liegt nur der SHA-256-Hash: Wer sie liest, kann damit kein
   Konto übernehmen. Das Token selbst existiert nur im Link. */

import crypto from "node:crypto";

/** Wie lange ein Link gilt. Eine Einladung darf länger liegen als eine
    Wiederherstellung — sie wird nicht in dem Moment angefordert, in dem
    jemand davorsitzt. */
export const GUELTIG_WIEDERHERSTELLUNG = 60;
export const GUELTIG_EINLADUNG = 7 * 24 * 60;

export const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Legt ein frisches Token an und entwertet ältere desselben Kontos —
 * es soll immer nur ein Link gelten.
 */
export function erstelleToken(db, accountId, gueltigMinuten) {
  const token = crypto.randomBytes(32).toString("base64url");
  const ablauf = new Date(Date.now() + gueltigMinuten * 60 * 1000).toISOString();
  db.transaction(() => {
    db.prepare("DELETE FROM password_resets WHERE account_id = ?").run(accountId);
    db.prepare("INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash(token), accountId, ablauf);
  })();
  return token;
}

/**
 * Entwertet alle offenen Links eines Kontos. Nötig, sobald das Passwort auf
 * anderem Weg gesetzt wird: Ging die Einladung an eine falsche Adresse, könnte
 * deren Empfänger das Konto sonst noch tagelang übernehmen.
 */
export function entwerteTokens(db, accountId) {
  db.prepare("DELETE FROM password_resets WHERE account_id = ?").run(accountId);
}

export function linkZu(config, token) {
  return `${config.publicUrl}/passwort-neu?token=${token}`;
}

/**
 * Ein Passwort, das niemand kennt — für Konten, die ihr Passwort erst über den
 * Einladungslink bekommen. Ein leerer Hash wäre gefährlich: Schon eine
 * Änderung an der Prüffunktion könnte ihn versehentlich passieren lassen.
 */
export function unbenutzbaresPasswort() {
  return crypto.randomBytes(32).toString("hex");
}
