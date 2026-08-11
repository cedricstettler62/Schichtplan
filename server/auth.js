/* Anmeldung, Sitzung und Rollenprüfung.
   Passwörter liegen ausschliesslich als bcrypt-Hash in der Datenbank.
   Die Sitzung steckt in einem signierten httpOnly-Cookie — im Browser
   weder lesbar noch fälschbar. */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const COOKIE = "sb_session";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 Tage

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function checkPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash || "");
}

/** Vergleich ohne Zeitunterschied — verhindert das Erraten Zeichen für Zeichen. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export function setSession(res, payload, config) {
  res.cookie(COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    sameSite: "lax",
    signed: true,
    secure: config.secureCookie,
    maxAge: MAX_AGE,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

/**
 * Liest die Sitzung aus dem Cookie und lädt das zugehörige Konto frisch aus der
 * Datenbank. Gelöschte Konten sind damit sofort abgemeldet.
 */
export function attachSession(db, config) {
  return (req, _res, next) => {
    req.session = null;
    const raw = req.signedCookies?.[COOKIE];
    if (!raw) return next();

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return next();
    }

    if (payload.t === "super") {
      req.session = { type: "super", name: config.superAdmin.name };
      return next();
    }

    if (payload.t === "company" && payload.accountId) {
      const account = db
        .prepare("SELECT id, company_id, name, role FROM accounts WHERE id = ?")
        .get(payload.accountId);
      if (account) {
        req.session = {
          type: "company",
          accountId: account.id,
          companyId: account.company_id,
          role: account.role,
          name: account.name,
        };
      }
    }
    return next();
  };
}

export function requireCompany(req, res, next) {
  if (req.session?.type !== "company") return res.status(401).json({ error: "Nicht angemeldet." });
  return next();
}

export function requireAdmin(req, res, next) {
  if (req.session?.type !== "company") return res.status(401).json({ error: "Nicht angemeldet." });
  if (req.session.role !== "admin") return res.status(403).json({ error: "Nur für Admins." });
  return next();
}

export function requireSuper(req, res, next) {
  if (req.session?.type !== "super") return res.status(403).json({ error: "Nur für die Verwaltung." });
  return next();
}

/**
 * Einfache Bremse gegen Passwort-Raten: pro IP höchstens `limit` Fehlversuche
 * im Zeitfenster. Absichtlich im Arbeitsspeicher — ein Neustart setzt zurück,
 * das reicht für ein Werkzeug dieser Grösse.
 */
export function createLoginLimiter({ limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();

  return {
    check(key) {
      const entry = attempts.get(key);
      if (!entry || Date.now() > entry.until) return true;
      return entry.count < limit;
    },
    fail(key) {
      const entry = attempts.get(key);
      if (!entry || Date.now() > entry.until) {
        attempts.set(key, { count: 1, until: Date.now() + windowMs });
      } else {
        entry.count += 1;
      }
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
