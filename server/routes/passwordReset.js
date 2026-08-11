/* Passwort vergessen: Link per E-Mail, neue Vergabe über ein Einmal-Token.

   Zwei Regeln durchziehen die Datei:
   - Nach aussen wird nie verraten, ob es ein Konto gibt. Sonst liesse sich die
     Belegschaft einer Firma abfragen.
   - In der Datenbank liegt nur der Hash des Tokens, nie das Token selbst. */

import crypto from "node:crypto";
import { Router } from "express";

import { createLoginLimiter, hashPassword } from "../auth.js";
import { sendeMail } from "../mail.js";

const GUELTIG_MINUTEN = 60;

const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

function nachricht(config, name, link) {
  return [
    `Hallo ${name}`,
    "",
    "Für dein Schichtboard-Konto wurde ein neues Passwort angefordert.",
    `Über diesen Link kannst du es innerhalb von ${GUELTIG_MINUTEN} Minuten neu setzen:`,
    "",
    link,
    "",
    "Warst du das nicht, kannst du diese Nachricht ignorieren — dein Passwort bleibt dann unverändert.",
    "",
    "Schichtboard",
  ].join("\n");
}

export default function passwordResetRoutes(db, config) {
  const router = Router();
  // Ohne Bremse liesse sich über diese Route reihenweise Post verschicken.
  const limiter = createLoginLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

  const gueltigesToken = (token) => {
    if (!token) return null;
    const row = db
      .prepare("SELECT token_hash, account_id, expires_at, used FROM password_resets WHERE token_hash = ?")
      .get(tokenHash(token));
    if (!row || row.used || new Date(row.expires_at) < new Date()) return null;
    return row;
  };

  /** Link anfordern. Antwortet immer gleich, egal ob es das Konto gibt. */
  router.post("/request", async (req, res, next) => {
    const key = req.ip || "unbekannt";
    if (!limiter.check(key)) {
      return res.status(429).json({ error: "Zu viele Versuche. Bitte später erneut probieren." });
    }
    limiter.fail(key);

    const code = String(req.body?.code || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();

    const konto = db
      .prepare(
        `SELECT a.id, a.name, a.email
           FROM accounts a JOIN companies c ON c.id = a.company_id
          WHERE c.code = ? AND lower(trim(a.email)) = ?`
      )
      .get(code, email);

    if (konto) {
      const token = crypto.randomBytes(32).toString("base64url");
      const ablauf = new Date(Date.now() + GUELTIG_MINUTEN * 60 * 1000).toISOString();
      db.transaction(() => {
        // Ältere Anforderungen entwerten: es soll immer nur ein Link gelten.
        db.prepare("DELETE FROM password_resets WHERE account_id = ?").run(konto.id);
        db.prepare("INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
          .run(tokenHash(token), konto.id, ablauf);
      })();

      const link = `${config.publicUrl}/passwort-neu?token=${token}`;
      try {
        await sendeMail(config, {
          an: konto.email,
          betreff: "Schichtboard: neues Passwort setzen",
          text: nachricht(config, konto.name, link),
        });
      } catch (err) {
        // Der Fehler gehört ins Protokoll, nicht in die Antwort — sonst
        // verriete schon das Scheitern, dass es das Konto gibt.
        console.error("Passwort-Mail konnte nicht verschickt werden:", err);
      }
    }

    res.json({ ok: true });
  });

  /** Prüft einen Link, bevor die Seite ein Formular anbietet. */
  router.get("/:token", (req, res) => {
    res.json({ valid: !!gueltigesToken(req.params.token) });
  });

  /** Neues Passwort setzen. Das Token gilt danach als verbraucht. */
  router.post("/:token", (req, res) => {
    const row = gueltigesToken(req.params.token);
    if (!row) {
      return res.status(410).json({ error: "Dieser Link ist abgelaufen oder wurde schon benutzt." });
    }

    const password = String(req.body?.password || "");
    if (password.length < 4) return res.status(400).json({ error: "Mindestens 4 Zeichen." });

    db.transaction(() => {
      db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?")
        .run(hashPassword(password), row.account_id);
      db.prepare("UPDATE password_resets SET used = 1 WHERE token_hash = ?").run(row.token_hash);
    })();

    res.json({ ok: true });
  });

  return router;
}
