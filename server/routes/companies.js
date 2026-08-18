/* Unternehmensverwaltung — ausschliesslich für den Super-Admin. */

import { Router } from "express";

import { endeAlleSitzungen, hashPassword, kontoWaereUnerreichbar, requireSuper, safeEqual } from "../auth.js";
import { releaseSeats, recompute } from "../assignment.js";
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

  /** Die Mitarbeitendenkonten einer Firma — daraus kommt eine Nachfolge. */
  router.get("/:id/employees", (req, res) => {
    res.json(
      db
        .prepare("SELECT id, name FROM accounts WHERE company_id = ? AND role = 'employee' ORDER BY rowid")
        .all(req.params.id)
    );
  });

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
      .prepare("SELECT id, name FROM accounts WHERE id = ? AND company_id = ? AND role = 'admin'")
      .get(req.params.accountId, req.params.id);
    if (!target) return res.status(404).json({ error: "Admin-Konto nicht gefunden." });

    if (!safeEqual(String(req.body?.currentPassword || ""), config.superAdmin.password)) {
      return res.status(403).json({ error: "Das Passwort der Verwaltung ist falsch." });
    }

    const password = String(req.body?.password || "");
    if (password.length < 4) return res.status(400).json({ error: "Mindestens 4 Zeichen." });
    /* Gleicher Name und gleiches Passwort wie ein anderes Konto der Firma: Die
       Anmeldung landete dann immer beim ersten, und das befreite Konto bliebe
       genauso ausgesperrt wie vorher. */
    if (kontoWaereUnerreichbar(db, req.params.id, target.name, password, target.id)) {
      return res.status(409).json({
        error: "Mit diesem Passwort wäre das Konto nicht erreichbar: Ein anderes Konto mit demselben Namen benutzt es bereits. Bitte ein anderes wählen.",
      });
    }

    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(password), target.id);
    /* Hier zählt es doppelt: Wird ein Admin-Konto befreit, weil es in falsche
       Hände geraten ist, muss jede noch offene Anmeldung damit enden. */
    endeAlleSitzungen(db, target.id);
    res.json({ ok: true });
  });

  /**
   * Löscht ein Admin-Konto. Innerhalb der Firma geht das nicht: Ein Admin darf
   * einen anderen weder aussperren noch entfernen, sonst könnte er die Firma
   * übernehmen. Bleibt jemand als Karteileiche stehen — ausgeschieden, Konto
   * noch da —, ist die Verwaltung der Weg.
   *
   * War es das letzte Admin-Konto, muss dabei eine Nachfolge aus der Belegschaft
   * bestimmt werden. Eine Firma ohne Administration kann niemand mehr
   * verwalten, und ihre Mitarbeitenden kämen an keine Schicht mehr.
   */
  router.delete("/:id/admins/:accountId", (req, res) => {
    const target = db
      .prepare("SELECT id, name FROM accounts WHERE id = ? AND company_id = ? AND role = 'admin'")
      .get(req.params.accountId, req.params.id);
    if (!target) return res.status(404).json({ error: "Admin-Konto nicht gefunden." });

    // Wie beim Zurücksetzen: Ein offen liegender Browser soll nicht reichen.
    if (!safeEqual(String(req.body?.currentPassword || ""), config.superAdmin.password)) {
      return res.status(403).json({ error: "Das Passwort der Verwaltung ist falsch." });
    }

    const { n: admins } = db
      .prepare("SELECT COUNT(*) AS n FROM accounts WHERE company_id = ? AND role = 'admin'")
      .get(req.params.id);

    let nachfolge = null;
    if (admins <= 1) {
      nachfolge = db
        .prepare("SELECT id, name FROM accounts WHERE id = ? AND company_id = ? AND role = 'employee'")
        .get(String(req.body?.nachfolgerId || ""), req.params.id);
      if (!nachfolge) {
        return res.status(409).json({
          error:
            "Das ist die letzte Administration. Bestimme ein Mitarbeitendenkonto, das die Administration übernimmt.",
        });
      }
    }

    /* Schichten, die das Konto besetzt hat, werden frei und sichtbar offen —
       genau wie beim Löschen innerhalb der Firma. */
    const frei = db
      .prepare("SELECT shift_id FROM enrollments WHERE account_id = ? AND assigned = 1")
      .all(target.id)
      .map((r) => r.shift_id);

    db.transaction(() => {
      if (nachfolge) {
        db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?").run(nachfolge.id);
      }
      db.prepare("DELETE FROM accounts WHERE id = ?").run(target.id);
    })();
    releaseSeats(db, frei);
    recompute(db, req.params.id);

    res.json({ ok: true, nachfolge: nachfolge ? nachfolge.name : null });
  });

  return router;
}
