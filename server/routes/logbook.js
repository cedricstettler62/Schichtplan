/* Logbuch-Einsicht: die volle Historie für Admins, ein einzelner freigegebener
   Ausschnitt für Mitarbeitende, dazu die Einsichtsanfragen dazwischen. */

import { Router } from "express";

import { startOfToday, toISO } from "#shared/dates.js";

import { requireAdmin, requireCompany } from "../auth.js";
import {
  createAccessRequest, decideAccessRequest, hasApprovedAccess, hasOpenAccessRequest,
  readInvolvedPastShifts, readLogbook,
} from "../logbook.js";

export default function logbookRoutes(db) {
  const router = Router();
  router.use(requireCompany);

  /**
   * Admins sehen die ganze Firmen-Historie (optional auf eine Schicht gefiltert).
   * Mitarbeitende nur mit `?shiftId=`, und nur, wenn dafür eine genehmigte
   * Einsichtsanfrage vorliegt.
   */
  router.get("/", (req, res) => {
    const shiftId = req.query.shiftId ? String(req.query.shiftId) : undefined;
    if (req.session.role === "admin") {
      return res.json(readLogbook(db, req.session.companyId, { shiftId }));
    }
    if (!shiftId || !hasApprovedAccess(db, req.session.companyId, req.session.accountId, shiftId)) {
      return res.status(403).json({ error: "Für diese Schicht liegt keine genehmigte Einsichtsanfrage vor." });
    }
    res.json(readLogbook(db, req.session.companyId, { shiftId }));
  });

  /** Eigene vergangene Schichten, für die eine Einsichtsanfrage möglich ist. */
  router.get("/eligible-shifts", (req, res) => {
    const rows = readInvolvedPastShifts(db, req.session.companyId, req.session.accountId, toISO(startOfToday()));
    res.json(rows);
  });

  router.post("/requests", (req, res) => {
    const shiftId = String(req.body?.shiftId || "");
    const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;

    const eligible = readInvolvedPastShifts(db, req.session.companyId, req.session.accountId, toISO(startOfToday()));
    const shift = eligible.find((s) => s.id === shiftId);
    if (!shift) {
      return res.status(400).json({ error: "Für diese Schicht ist keine Einsichtsanfrage möglich." });
    }
    if (hasOpenAccessRequest(db, req.session.companyId, req.session.accountId, shiftId)) {
      return res.status(409).json({ error: "Für diese Schicht liegt bereits eine Anfrage vor." });
    }

    const id = createAccessRequest(db, { companyId: req.session.companyId, accountId: req.session.accountId, shift, note });
    res.json({ id });
  });

  router.post("/requests/:id/approve", requireAdmin, (req, res) => {
    const ok = decideAccessRequest(db, { id: req.params.id, companyId: req.session.companyId, status: "approved" });
    if (!ok) return res.status(404).json({ error: "Anfrage nicht gefunden oder schon entschieden." });
    res.json({ ok: true });
  });

  router.post("/requests/:id/decline", requireAdmin, (req, res) => {
    const ok = decideAccessRequest(db, { id: req.params.id, companyId: req.session.companyId, status: "declined" });
    if (!ok) return res.status(404).json({ error: "Anfrage nicht gefunden oder schon entschieden." });
    res.json({ ok: true });
  });

  return router;
}
