/* Unternehmensverwaltung — ausschliesslich für den Super-Admin. */

import { Router } from "express";

import { requireSuper } from "../auth.js";
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
    if (!name || !adminName || adminPassword.length < 4) {
      return res.status(400).json({ error: "Firmenname, Admin-Name und ein Passwort mit mindestens 4 Zeichen sind nötig." });
    }

    const taken = db.prepare("SELECT 1 FROM companies WHERE code = ?").get(code);
    if (taken || code === config.superAdmin.code) {
      return res.status(409).json({ error: "Dieser Firmencode wird bereits verwendet." });
    }

    const id = createCompany(db, {
      code,
      name,
      adminName,
      adminEmail: String(req.body?.adminEmail || "").trim(),
      adminPassword,
    });
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

  return router;
}
