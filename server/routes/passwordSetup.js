/* Die Seite hinter dem Einladungslink — bewusst ohne Anmeldung: Wer sie
   öffnet, hat noch kein Passwort und kann sich folglich nicht anmelden. Das
   Zeichen in der Adresse ist hier der Zugang, genau wie beim Kalenderabo. */

import { Router } from "express";

import { passwortProblem } from "#shared/password.js";

import { hashPassword, kontoWaereUnerreichbar } from "../auth.js";
import { leseSetupToken, verwirfSetupTokens } from "../passwordSetup.js";

export default function passwordSetupRoutes(db) {
  const router = Router();

  /** Name und Firma zur Begrüssung, bevor überhaupt ein Passwort eingegeben ist. */
  router.get("/password-setup/:token", (req, res) => {
    const info = leseSetupToken(db, req.params.token);
    if (!info) return res.status(404).json({ error: "Dieser Link ist ungültig oder abgelaufen." });
    res.json({ name: info.accountName, companyName: info.companyName });
  });

  router.post("/password-setup/:token", (req, res) => {
    const info = leseSetupToken(db, req.params.token);
    if (!info) return res.status(404).json({ error: "Dieser Link ist ungültig oder abgelaufen." });

    const password = String(req.body?.password || "");
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) return res.status(400).json({ error: passwortFehler });

    // Dieselbe Regel wie überall sonst: gleicher Name, gleiches Passwort machte
    // eines der beiden Konten unerreichbar.
    if (kontoWaereUnerreichbar(db, info.companyId, info.accountName, password, info.accountId)) {
      return res.status(409).json({
        error: "Mit diesem Passwort wäre das Konto nicht erreichbar: Ein anderes Konto mit demselben Namen benutzt es bereits. Bitte ein anderes wählen.",
      });
    }

    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(password), info.accountId);
    verwirfSetupTokens(db, info.accountId);
    res.json({ ok: true });
  });

  return router;
}
