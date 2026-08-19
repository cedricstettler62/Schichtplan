/* Anmeldung, Sitzung und Rollenprüfung.
   Passwörter liegen ausschliesslich als bcrypt-Hash in der Datenbank.
   Die Sitzung steckt in einem signierten httpOnly-Cookie — im Browser
   weder lesbar noch fälschbar. */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const COOKIE = "sb_session";
/* Angemeldet bleibt, wer angemeldet ist: Die Sitzung endet nicht von selbst,
   sondern erst beim Abmelden oder mit einer Passwortänderung. 400 Tage sind
   die längste Frist, die Browser einem Cookie überhaupt noch zugestehen, und
   jeder Aufruf von /api/state setzt sie neu. */
const MAX_AGE = 400 * 24 * 60 * 60 * 1000;

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

/**
 * Wäre ein Konto mit diesem Namen und diesem Passwort noch erreichbar?
 *
 * Namen sind absichtlich nicht eindeutig — zwei Menschen dürfen gleich heissen.
 * Die Anmeldung unterscheidet sie am Passwort und nimmt das erste Konto, dessen
 * Passwort passt. Stimmen bei zweien *beide* Angaben überein, kommt das zweite
 * Konto nie an die Reihe: Wer dazu gehört, kommt nicht hinein und kann sein
 * Passwort deshalb auch nicht selbst ändern.
 *
 * `ausser` lässt das eigene Konto aus der Prüfung heraus — beim Ändern des
 * eigenen Passworts ist man sich sonst selbst im Weg.
 */
export function kontoWaereUnerreichbar(db, companyId, name, password, ausser = null) {
  return db
    .prepare("SELECT id, password_hash FROM accounts WHERE company_id = ? AND lower(trim(name)) = ?")
    .all(companyId, String(name || "").trim().toLowerCase())
    .some((a) => a.id !== ausser && checkPassword(password, a.password_hash));
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
 * Meldet ein Konto an. Der Stand der Sitzungs-Epoche wandert ins Cookie: Zählt
 * eine Passwortänderung ihn später hoch, gilt dieses Cookie nicht mehr.
 */
export function setAccountSession(res, account, config) {
  setSession(res, { t: "company", accountId: account.id, e: account.session_epoch ?? 0 }, config);
}

/**
 * Setzt die Frist einer bestehenden Sitzung neu. Ohne das liefe auch eine
 * täglich benutzte Anmeldung nach 400 Tagen aus.
 */
export function refreshSession(req, res, config) {
  if (req.session?.type === "super") setSession(res, { t: "super" }, config);
  if (req.session?.type === "company") {
    setSession(res, { t: "company", accountId: req.session.accountId, e: req.session.epoch }, config);
  }
}

/**
 * Beendet jede Anmeldung eines Kontos — auf jedem Gerät, auch die auf dem
 * Telefon, das seit Wochen in der Schublade liegt.
 *
 * Gehört an jede Stelle, die ein Passwort setzt: Wer ausgesperrt war und ein
 * neues bekommt, wäre sonst nicht wirklich ausgesperrt gewesen. Gibt den
 * neuen Stand zurück, damit das eigene Gerät ein gültiges Cookie behalten
 * kann.
 */
export function endeAlleSitzungen(db, accountId) {
  db.prepare("UPDATE accounts SET session_epoch = session_epoch + 1 WHERE id = ?").run(accountId);
  return db.prepare("SELECT session_epoch FROM accounts WHERE id = ?").get(accountId)?.session_epoch ?? 0;
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
      // Pausiert oder archiviert: kein Konto der Firma kommt herein, auch mit
      // gültigem Cookie nicht — der Join liefert dann schlicht keine Zeile.
      const account = db
        .prepare(
          `SELECT a.id, a.company_id, a.name, a.role, a.session_epoch
             FROM accounts a JOIN companies c ON c.id = a.company_id
            WHERE a.id = ? AND c.paused_at IS NULL AND c.archived_at IS NULL`
        )
        .get(payload.accountId);
      // Ein Cookie aus der Zeit vor der letzten Passwortänderung zählt nicht mehr.
      if (account && (payload.e ?? 0) === account.session_epoch) {
        req.session = {
          type: "company",
          accountId: account.id,
          companyId: account.company_id,
          role: account.role,
          name: account.name,
          epoch: account.session_epoch,
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
 *
 * Abgelaufene Einträge werden aktiv entfernt, sonst würde jede IP, von der je
 * ein Fehlversuch kam, dauerhaft Speicher belegen: beim Zugriff auf den
 * eigenen Eintrag, höchstens einmal pro Zeitfenster für alle übrigen, und im
 * Notfall (`maxKeys`) weicht das älteste Fenster.
 */
export function createLoginLimiter({ limit = 10, windowMs = 15 * 60 * 1000, maxKeys = 5000 } = {}) {
  const attempts = new Map();
  let nextSweep = Date.now() + windowMs;

  /** Wirft alles Abgelaufene weg — Laufzeit über die ganze Map, daher selten. */
  const sweep = (now) => {
    nextSweep = now + windowMs;
    for (const [k, entry] of attempts) {
      if (now > entry.until) attempts.delete(k);
    }
  };

  /** Der noch gültige Eintrag; ein abgelaufener verschwindet dabei gleich. */
  const live = (key, now) => {
    const entry = attempts.get(key);
    if (!entry) return null;
    if (now <= entry.until) return entry;
    attempts.delete(key);
    return null;
  };

  return {
    check(key) {
      const entry = live(key, Date.now());
      return !entry || entry.count < limit;
    },
    fail(key) {
      const now = Date.now();
      if (now >= nextSweep) sweep(now);

      const entry = live(key, now);
      if (entry) {
        entry.count += 1;
        return;
      }
      // Viele Adressen im selben Fenster: das älteste Fenster macht Platz.
      while (attempts.size >= maxKeys) {
        attempts.delete(attempts.keys().next().value);
      }
      attempts.set(key, { count: 1, until: now + windowMs });
    },
    reset(key) {
      attempts.delete(key);
    },
    /** Nur zur Kontrolle (Tests): wie viele Adressen gerade vorgemerkt sind. */
    get size() {
      return attempts.size;
    },
  };
}
