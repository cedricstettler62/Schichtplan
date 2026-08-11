/* Qualifikationen, Konten und Einstellungen einer Firma.
   Jede Route prüft Rolle *und* Firmenzugehörigkeit — im Browser schützte
   bisher nur das Ausblenden von Tabs. */

import { Router } from "express";

import { startOfToday, toISO } from "#shared/dates.js";

import { checkPassword, hashPassword, requireAdmin, requireCompany } from "../auth.js";
import { recompute, releaseSeats } from "../assignment.js";
import { uid } from "../ids.js";

/** Konto aus *dieser* Firma holen — sonst 404, egal ob es anderswo existiert. */
function ownAccount(db, req, id) {
  return db
    .prepare("SELECT id, company_id, name, role FROM accounts WHERE id = ? AND company_id = ?")
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
    /* Das Schema setzt shifts.qualification_id beim Löschen auf NULL — und eine
       Schicht ohne Qualifikation lässt sich weder einschreiben noch übernehmen.
       Sie wäre also für immer unbesetzbar. Deshalb hier abfangen, solange noch
       kommende Schichten die Qualifikation verlangen. */
    const { n } = db
      .prepare(
        "SELECT COUNT(*) AS n FROM shifts WHERE company_id = ? AND qualification_id = ? AND date >= ?"
      )
      .get(req.session.companyId, req.params.id, toISO(startOfToday()));

    if (n > 0) {
      return res.status(409).json({
        error:
          n === 1
            ? "Eine kommende Schicht verlangt diese Qualifikation. Löschen ist erst möglich, wenn sie vorbei ist."
            : `${n} kommende Schichten verlangen diese Qualifikation. Löschen ist erst möglich, wenn sie vorbei sind.`,
      });
    }

    // Verknüpfungen und vergangene Schichten räumt das Schema selbst auf.
    db.prepare("DELETE FROM qualifications WHERE id = ? AND company_id = ?")
      .run(req.params.id, req.session.companyId);
    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  /* --- Konten --- */

  /**
   * Legt ein Konto samt erstem Passwort an. Die Administration gibt es
   * persönlich weiter und die Person ändert es danach selbst — schriftlich
   * verschickt läge es dauerhaft irgendwo herum.
   */
  router.post("/employees", requireAdmin, (req, res) => {
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    if (!name) return res.status(400).json({ error: "Ein Name ist nötig." });
    if (password.length < 4) return res.status(400).json({ error: "Das Passwort braucht mindestens 4 Zeichen." });

    const id = uid("a");
    db.prepare(
      "INSERT INTO accounts (id, company_id, name, password_hash, role) VALUES (?, ?, ?, ?, 'employee')"
    ).run(id, req.session.companyId, name, hashPassword(password));

    res.json({ id });
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

  /**
   * Eigenes Passwort ändern — oder als Admin das eines Mitarbeitendenkontos
   * zurücksetzen, wenn dort jemand ausgesperrt ist. Bestätigt wird in beiden
   * Fällen mit dem *eigenen* Passwort: Das fremde kennt der Admin ja nicht.
   */
  router.post("/accounts/:id/password", requireCompany, (req, res) => {
    const target = ownAccount(db, req, req.params.id);
    if (!target) return res.status(404).json({ error: "Konto nicht gefunden." });

    const isSelf = target.id === req.session.accountId;
    // Unter Admins setzt niemand das Passwort eines anderen — sonst könnte ein
    // Admin die Firma übernehmen, indem er die anderen aussperrt.
    const mayReset = isSelf || (req.session.role === "admin" && target.role !== "admin");
    if (!mayReset) return res.status(403).json({ error: "Nicht erlaubt." });

    const password = String(req.body?.password || "");
    if (password.length < 4) return res.status(400).json({ error: "Mindestens 4 Zeichen." });

    const eigenes = db.prepare("SELECT password_hash FROM accounts WHERE id = ?").get(req.session.accountId);
    if (!checkPassword(String(req.body?.currentPassword || ""), eigenes.password_hash)) {
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

    /* Schichten, die dieses Konto besetzt hat, dürfen nicht still an die
       nächstbeste eingeschriebene Person weitergereicht werden — sie sollen
       sichtbar unter "Noch offene Plätze" auftauchen. Die Zuordnung muss vor
       dem Löschen gelesen werden, danach hat das Schema sie weggeräumt. */
    const frei = db
      .prepare("SELECT shift_id FROM enrollments WHERE account_id = ? AND assigned = 1")
      .all(target.id)
      .map((r) => r.shift_id);

    db.prepare("DELETE FROM accounts WHERE id = ?").run(target.id);
    releaseSeats(db, frei);
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
