import { Router } from "express";

import { passwortProblem } from "#shared/password.js";

import {
  checkPassword,
  clearSession,
  createLoginLimiter,
  hashPassword,
  kontoWaereUnerreichbar,
  refreshSession,
  requireCompany,
  safeEqual,
  setAccountSession,
  setSession,
} from "../auth.js";
import { companySummaries, readCompany } from "../db.js";
import { uid } from "../ids.js";

/* Ein einziger Wortlaut für jeden Grund, aus dem eine Anmeldung scheitert —
   falscher Code, falscher Name, falsches Passwort. Getrennte Meldungen ("Name
   oder Passwort falsch" gegen "Unbekannter Firmencode") verraten, welcher der
   drei Werte nicht stimmte, und machten so das gezielte Erraten leichter. */
const LOGIN_FEHLER = "Firmencode, Name oder Passwort ist falsch.";

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
        return res.status(401).json({ error: LOGIN_FEHLER });
      }
      limiter.reset(key);
      setSession(res, { t: "super" }, config);
      return res.json({ ok: true });
    }

    const company = db.prepare("SELECT id, paused_at, archived_at FROM companies WHERE code = ?").get(code);
    // Archiviert heisst für den Login: als gäbe es die Firma nicht mehr — kein
    // Hinweis darauf, dass der Code einmal gültig war.
    if (!company || company.archived_at) {
      limiter.fail(key);
      return res.status(401).json({ error: LOGIN_FEHLER });
    }
    if (company.paused_at) {
      limiter.fail(key);
      return res.status(403).json({ error: "Dieses Unternehmen ist vorübergehend gesperrt." });
    }

    // Namen sind nicht eindeutig — jedes passende Konto wird geprüft.
    const candidates = db
      .prepare(
        "SELECT id, password_hash, session_epoch, status FROM accounts WHERE company_id = ? AND lower(trim(name)) = ?"
      )
      .all(company.id, name);
    const account = candidates.find((a) => checkPassword(password, a.password_hash));

    if (!account) {
      limiter.fail(key);
      return res.status(401).json({ error: LOGIN_FEHLER });
    }

    // Name und Passwort stimmen, aber noch kein Admin hat zugestimmt: kein
    // Fehlversuch, sondern ein eigener, verständlicher Zustand.
    if (account.status === "pending") {
      limiter.reset(key);
      return res.status(403).json({
        error: "Dieses Konto wartet noch auf die Bestätigung durch eine Administration deines Unternehmens.",
        pending: true,
      });
    }

    limiter.reset(key);
    setAccountSession(res, account, config);
    return res.json({ ok: true });
  });

  /**
   * Selbstregistrierung: Mitarbeitende legen ihr eigenes Konto an, ohne dass
   * die Administration Name und erstes Passwort persönlich weitergeben muss.
   * Das Konto entsteht als 'pending' und bleibt es, bis ein Admin unter
   * „Anmeldungen“ zustimmt — anmelden kann sich damit vorher niemand.
   *
   * Ein Admin-Konto entsteht auf diesem Weg nie: Rolle ist fest 'employee'.
   */
  router.post("/register", (req, res) => {
    const code = String(req.body?.code || "").trim();
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    const key = req.ip || "unbekannt";

    if (!limiter.check(key)) {
      return res.status(429).json({ error: "Zu viele Versuche. Bitte später erneut probieren." });
    }

    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Bitte einen 6-stelligen Firmencode eingeben." });
    if (!name) return res.status(400).json({ error: "Bitte einen Namen eingeben." });
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) return res.status(400).json({ error: passwortFehler });

    const company = db.prepare("SELECT id, paused_at, archived_at FROM companies WHERE code = ?").get(code);
    if (!company || company.archived_at) {
      limiter.fail(key);
      return res.status(400).json({ error: "Unbekannter Firmencode." });
    }
    if (company.paused_at) {
      limiter.fail(key);
      return res.status(403).json({ error: "Dieses Unternehmen ist vorübergehend gesperrt." });
    }

    // Dieselbe Regel wie bei einem von der Administration angelegten Konto:
    // gleicher Name und gleiches Passwort wie ein bestehendes Konto machten
    // eines der beiden unerreichbar.
    if (kontoWaereUnerreichbar(db, company.id, name, password)) {
      return res.status(409).json({
        error: "Dieses Konto wäre nicht erreichbar: Es gibt bereits ein Konto mit diesem Namen und diesem Passwort. Bitte ein anderes Passwort vergeben.",
      });
    }

    db.prepare(
      "INSERT INTO accounts (id, company_id, name, password_hash, role, status) VALUES (?, ?, ?, ?, 'employee', 'pending')"
    ).run(uid("a"), company.id, name, hashPassword(password));

    limiter.reset(key);
    res.json({ ok: true });
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
        archivedCompanies: companySummaries(db, { archiviert: true }),
      });
    }
    if (req.session?.type === "company") {
      /* Mitarbeitende bekommen nur ihre eigenen Einsichtsanfragen — die Notiz
         einer fremden Anfrage geht ausser der Administration niemanden an. */
      const company = readCompany(db, req.session.companyId, {
        anfragenVon: req.session.role === "admin" ? null : req.session.accountId,
        admin: req.session.role === "admin",
      });
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
