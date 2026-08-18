import { Router } from "express";

import {
  checkPassword,
  clearSession,
  createLoginLimiter,
  refreshSession,
  requireCompany,
  safeEqual,
  setAccountSession,
  setSession,
} from "../auth.js";
import { companySummaries, readCompany } from "../db.js";

export default function authRoutes(db, config) {
  const router = Router();
  const limiter = createLoginLimiter();

  router.post("/login", (req, res) => {
    const code = String(req.body?.code || "").trim();
    const name = String(req.body?.name || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const key = req.ip || "unbekannt";

    if (!limiter.check(key)) {
      return res.status(429).json({ error: "Zu viele Versuche. Bitte später erneut probieren." });
    }

    if (safeEqual(code, config.superAdmin.code)) {
      const ok =
        name === config.superAdmin.name.trim().toLowerCase() &&
        safeEqual(password, config.superAdmin.password);
      if (!ok) {
        limiter.fail(key);
        return res.status(401).json({ error: "Name oder Passwort ist falsch." });
      }
      limiter.reset(key);
      setSession(res, { t: "super" }, config);
      return res.json({ ok: true });
    }

    const company = db.prepare("SELECT id FROM companies WHERE code = ?").get(code);
    if (!company) {
      limiter.fail(key);
      return res.status(401).json({ error: "Unbekannter Firmencode." });
    }

    // Namen sind nicht eindeutig — jedes passende Konto wird geprüft.
    const candidates = db
      .prepare(
        "SELECT id, password_hash, session_epoch FROM accounts WHERE company_id = ? AND lower(trim(name)) = ?"
      )
      .all(company.id, name);
    const account = candidates.find((a) => checkPassword(password, a.password_hash));

    if (!account) {
      limiter.fail(key);
      return res.status(401).json({ error: "Name oder Passwort ist falsch." });
    }

    limiter.reset(key);
    setAccountSession(res, account, config);
    return res.json({ ok: true });
  });

  router.post("/logout", (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  router.get("/state", (req, res) => {
    /* Jeder Aufruf verlängert die Anmeldung. Die Oberfläche fragt den Stand
       bei jedem Start und nach jeder Änderung ab — wer die App benutzt, bleibt
       damit angemeldet, ohne je ein Passwort wieder einzugeben. */
    refreshSession(req, res, config);

    if (req.session?.type === "super") {
      return res.json({
        type: "super",
        name: config.superAdmin.name,
        companies: companySummaries(db),
      });
    }
    if (req.session?.type === "company") {
      const company = readCompany(db, req.session.companyId);
      if (!company) return res.status(401).json({ error: "Nicht angemeldet." });
      return res.json({ type: "company", userId: req.session.accountId, company });
    }
    return res.status(401).json({ error: "Nicht angemeldet." });
  });

  /** Bestätigung des eigenen Passworts vor sensiblen Änderungen. */
  router.post("/verify-password", requireCompany, (req, res) => {
    const row = db.prepare("SELECT password_hash FROM accounts WHERE id = ?").get(req.session.accountId);
    res.json({ ok: !!row && checkPassword(String(req.body?.password || ""), row.password_hash) });
  });

  return router;
}
