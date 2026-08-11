/* Unternehmensverwaltung — ausschliesslich für den Super-Admin. */

import { Router } from "express";

import { requireSuper } from "../auth.js";
import { createCompany } from "../db.js";
import { sendeEinladung } from "../mail.js";
import { GUELTIG_EINLADUNG, erstelleToken, linkZu, unbenutzbaresPasswort } from "../resetToken.js";

export default function companiesRoutes(db, config) {
  const router = Router();
  router.use(requireSuper);

  router.post("/", async (req, res) => {
    const code = String(req.body?.code || "").trim();
    const name = String(req.body?.name || "").trim();
    const adminName = String(req.body?.adminName || "").trim();
    const adminEmail = String(req.body?.adminEmail || "").trim();

    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Der Firmencode muss 6-stellig sein." });
    if (!name || !adminName) {
      return res.status(400).json({ error: "Firmenname und Admin-Name sind nötig." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail)) {
      return res.status(400).json({ error: "Eine gültige E-Mail-Adresse für das Admin-Konto ist nötig." });
    }

    const taken = db.prepare("SELECT 1 FROM companies WHERE code = ?").get(code);
    if (taken || code === config.superAdmin.code) {
      return res.status(409).json({ error: "Dieser Firmencode wird bereits verwendet." });
    }

    // Das Admin-Konto bekommt sein Passwort über den Einladungslink.
    const id = createCompany(db, {
      code, name, adminName, adminEmail, adminPassword: unbenutzbaresPasswort(),
    });
    const adminId = db.prepare("SELECT id FROM accounts WHERE company_id = ?").get(id).id;
    const link = linkZu(config, erstelleToken(db, adminId, GUELTIG_EINLADUNG));

    const benachrichtigt = req.body?.notify === false
      ? false
      : await sendeEinladung(config, {
          an: adminEmail, name: adminName, firma: name, code,
          link, gueltigTage: GUELTIG_EINLADUNG / (24 * 60),
        });

    res.json({ id, benachrichtigt, link });
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
