/* Qualifikationen, Konten und Einstellungen einer Firma.
   Jede Route prüft Rolle *und* Firmenzugehörigkeit — im Browser schützte
   bisher nur das Ausblenden von Tabs. */

import { Router } from "express";

import { checkPassword, hashPassword, requireAdmin, requireCompany } from "../auth.js";
import { recompute } from "../assignment.js";
import { uid } from "../ids.js";

/** Konto aus *dieser* Firma holen — sonst 404, egal ob es anderswo existiert. */
function ownAccount(db, req, id) {
  return db
    .prepare("SELECT id, company_id, name, email, role FROM accounts WHERE id = ? AND company_id = ?")
    .get(id, req.session.companyId);
}

function adminCount(db, companyId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM accounts WHERE company_id = ? AND role = 'admin'")
    .get(companyId).n;
}

export default function companyRoutes(db) {
  // Bewusst pro Route abgesichert statt per router.use: dieser Router hängt
  // direkt unter /api und darf nachfolgende Router (etwa /api/companies für
  // die Verwaltung) nicht abfangen.
  const router = Router();

  /* --- Qualifikationen --- */

  router.post("/qualifications", requireAdmin, (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name fehlt." });

    const existing = db
      .prepare("SELECT id FROM qualifications WHERE company_id = ? AND lower(name) = lower(?)")
      .get(req.session.companyId, name);
    if (existing) return res.json({ id: existing.id });

    const id = uid("q");
    db.prepare("INSERT INTO qualifications (id, company_id, name) VALUES (?, ?, ?)")
      .run(id, req.session.companyId, name);
    res.json({ id });
  });

  router.delete("/qualifications/:id", requireAdmin, (req, res) => {
    // Verknüpfungen und Schicht-Anforderungen räumt das Schema selbst auf.
    db.prepare("DELETE FROM qualifications WHERE id = ? AND company_id = ?")
      .run(req.params.id, req.session.companyId);
    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  /* --- Konten --- */

  router.post("/employees", requireAdmin, (req, res) => {
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    if (!name || password.length < 4) {
      return res.status(400).json({ error: "Name und ein Passwort mit mindestens 4 Zeichen sind nötig." });
    }
    const id = uid("a");
    db.prepare(
      "INSERT INTO accounts (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, 'employee')"
    ).run(id, req.session.companyId, name, String(req.body?.email || "").trim(), hashPassword(password));
    res.json({ id });
  });

  router.patch("/accounts/:id/email", requireCompany, (req, res) => {
    const target = ownAccount(db, req, req.params.id);
    if (!target) return res.status(404).json({ error: "Konto nicht gefunden." });

    const isSelf = target.id === req.session.accountId;
    const mayEdit = isSelf || (req.session.role === "admin" && target.role !== "admin");
    if (!mayEdit) return res.status(403).json({ error: "Nicht erlaubt." });

    db.prepare("UPDATE accounts SET email = ? WHERE id = ?").run(String(req.body?.email || "").trim(), target.id);
    res.json({ ok: true });
  });

  router.patch("/accounts/:id/qualifications", requireCompany, (req, res) => {
    const target = ownAccount(db, req, req.params.id);
    if (!target) return res.status(404).json({ error: "Konto nicht gefunden." });

    const isSelf = target.id === req.session.accountId;
    const mayEdit = isSelf || (req.session.role === "admin" && target.role !== "admin");
    if (!mayEdit) return res.status(403).json({ error: "Nicht erlaubt." });

    const qual = db
      .prepare("SELECT id FROM qualifications WHERE id = ? AND company_id = ?")
      .get(String(req.body?.qualificationId || ""), req.session.companyId);
    if (!qual) return res.status(404).json({ error: "Qualifikation nicht gefunden." });

    if (req.body?.value) {
      db.prepare("INSERT OR IGNORE INTO account_qualifications (account_id, qualification_id) VALUES (?, ?)")
        .run(target.id, qual.id);
    } else {
      db.prepare("DELETE FROM account_qualifications WHERE account_id = ? AND qualification_id = ?")
        .run(target.id, qual.id);
    }
    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  router.post("/accounts/:id/promote", requireAdmin, (req, res) => {
    const target = ownAccount(db, req, req.params.id);
    if (!target) return res.status(404).json({ error: "Konto nicht gefunden." });
    db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?").run(target.id);
    res.json({ ok: true });
  });

  router.post("/accounts/:id/password", requireCompany, (req, res) => {
    const target = ownAccount(db, req, req.params.id);
    if (!target) return res.status(404).json({ error: "Konto nicht gefunden." });
    // Das eigene Passwort ändert nur, wer das aktuelle kennt.
    if (target.id !== req.session.accountId) return res.status(403).json({ error: "Nicht erlaubt." });

    const password = String(req.body?.password || "");
    if (password.length < 4) return res.status(400).json({ error: "Mindestens 4 Zeichen." });

    const row = db.prepare("SELECT password_hash FROM accounts WHERE id = ?").get(target.id);
    if (!checkPassword(String(req.body?.currentPassword || ""), row.password_hash)) {
      return res.status(403).json({ error: "Das aktuelle Passwort ist falsch." });
    }

    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(password), target.id);
    res.json({ ok: true });
  });

  router.delete("/accounts/:id", requireCompany, (req, res) => {
    const target = ownAccount(db, req, req.params.id);
    if (!target) return res.status(404).json({ error: "Konto nicht gefunden." });

    const isSelf = target.id === req.session.accountId;
    if (!isSelf && req.session.role !== "admin") return res.status(403).json({ error: "Nicht erlaubt." });
    if (target.role === "admin" && adminCount(db, req.session.companyId) <= 1) {
      return res.status(409).json({ error: "Die letzte Administration lässt sich nicht löschen." });
    }

    db.prepare("DELETE FROM accounts WHERE id = ?").run(target.id);
    recompute(db, req.session.companyId);
    res.json({ ok: true, self: isSelf });
  });

  /* --- Einstellungen --- */

  router.patch("/settings", requireAdmin, (req, res) => {
    const day = Number(req.body?.assignmentDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return res.status(400).json({ error: "Zuteilungstag muss zwischen 1 und 28 liegen." });
    }
    db.prepare("UPDATE companies SET assignment_day = ? WHERE id = ?").run(day, req.session.companyId);
    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  return router;
}
