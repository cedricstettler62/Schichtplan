/* Unternehmensverwaltung — ausschliesslich für den Super-Admin. */

import { Router } from "express";

import { hashPassword, requireSuper, safeEqual } from "../auth.js";
import { createCompany } from "../db.js";

export default function companiesRoutes(db, config) {
  const router = Router();
  router.use(requireSuper);

  router.post("/", (req, res) => {
    const code = String(req.body?.code || "").trim();
    const name = String(req.body?.name || "").trim();
    const adminName = String(req.body?.adminName || "").trim();
    const adminPassword = String(req.body?.adminPassword || "");

    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Der Firmencode muss 6-stellig sein." });
    if (!name || !adminName) {
      return res.status(400).json({ error: "Firmenname und Admin-Name sind nötig." });
    }
    if (adminPassword.length < 4) {
      return res.status(400).json({ error: "Das Passwort des Admin-Kontos braucht mindestens 4 Zeichen." });
    }

    const taken = db.prepare("SELECT 1 FROM companies WHERE code = ?").get(code);
    if (taken || code === config.superAdmin.code) {
      return res.status(409).json({ error: "Dieser Firmencode wird bereits verwendet." });
    }

    // Das erste Passwort setzt die Verwaltung und gibt es persönlich weiter.
    const id = createCompany(db, { code, name, adminName, adminPassword });
    res.json({ id });
  });

  router.patch("/:id", (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name fehlt." });
    db.prepare("UPDATE companies SET name = ? WHERE id = ?").run(name, req.params.id);
    res.json({ ok: true });
  });

  router.delete("/:id", (req, res) => {
    // Konten, Schichten und Einschreibungen hängen per ON DELETE CASCADE daran.
    db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /* --- Ausgesperrte Admins --- */

  /** Die Admin-Konten einer Firma, damit die Verwaltung weiss, wen sie befreit. */
  router.get("/:id/admins", (req, res) => {
    const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(req.params.id);
    if (!company) return res.status(404).json({ error: "Unternehmen nicht gefunden." });
    res.json(
      db
        .prepare("SELECT id, name FROM accounts WHERE company_id = ? AND role = 'admin' ORDER BY rowid")
        .all(company.id)
    );
  });

  /**
   * Setzt das Passwort eines Firmen-Admins neu. Unter Admins darf das niemand
   * — sonst könnte einer die Firma übernehmen —, also bleibt für ein
   * ausgesperrtes Admin-Konto nur der Weg über die Verwaltung.
   *
   * Bestätigt wird mit dem Passwort der Verwaltung: Ein offen liegender
   * Browser soll nicht reichen, um sich in jede Firma zu setzen.
   */
  router.post("/:id/admins/:accountId/password", (req, res) => {
    const target = db
      .prepare("SELECT id FROM accounts WHERE id = ? AND company_id = ? AND role = 'admin'")
      .get(req.params.accountId, req.params.id);
    if (!target) return res.status(404).json({ error: "Admin-Konto nicht gefunden." });

    if (!safeEqual(String(req.body?.currentPassword || ""), config.superAdmin.password)) {
      return res.status(403).json({ error: "Das Passwort der Verwaltung ist falsch." });
    }

    const password = String(req.body?.password || "");
    if (password.length < 4) return res.status(400).json({ error: "Mindestens 4 Zeichen." });

    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(password), target.id);
    res.json({ ok: true });
  });

  return router;
}
