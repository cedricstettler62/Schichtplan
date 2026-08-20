import { useEffect, useState } from "react";
import { emailProblem } from "#shared/email.js";
import { emailStatus } from "../api.js";
import { useKurzeMeldung } from "../hooks.js";
import Karte from "./Karte.jsx";

/**
 * Die eigene E-Mail-Adresse — für Benachrichtigungen. `required` macht sie
 * zur Pflicht (Mitarbeitende und Admins, die eine Zuteilung erreichen muss)
 * und verbietet, sie wieder auf leer zu setzen; bei der Verwaltung (kein
 * `required`) bleibt sie eine rein optionale Kontaktangabe.
 * `hinweis` erklärt, wofür sie in diesem Konto konkret gebraucht wird.
 */
export default function EmailCard({ accountId, onChangeEmail, hinweis, required = false }) {
  const [email, setEmail] = useState("");
  const [gespeichert, setGespeichert] = useState("");
  const [geladen, setGeladen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, zeigeGespeichert] = useKurzeMeldung();

  useEffect(() => {
    let aktiv = true;
    emailStatus(accountId)
      .then((data) => { if (aktiv) { setEmail(data.email || ""); setGespeichert(data.email || ""); } })
      .catch(() => {})
      .finally(() => { if (aktiv) setGeladen(true); });
    return () => { aktiv = false; };
  }, [accountId]);

  const submit = async () => {
    const problem = emailProblem(email, { required });
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError("");
    const meldung = await onChangeEmail(email.trim());
    setBusy(false);
    if (meldung) { setError(meldung); return; }
    setGespeichert(email.trim());
    zeigeGespeichert();
  };

  return (
    <Karte titel="E-Mail-Adresse" intro={hinweis}>
      <div className="sb-inline-add">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="name@beispiel.ch"
          disabled={!geladen}
          aria-label="E-Mail-Adresse"
        />
        <button type="button" className="sb-btn sb-btn-ink" onClick={submit} disabled={busy || !geladen}>
          {busy ? "Wird gespeichert …" : "Speichern"}
        </button>
      </div>
      {saved && <p className="sb-saved-note">Gespeichert.</p>}
      {error && <p className="sb-error">{error}</p>}
      {geladen && !gespeichert && !saved && <p className="sb-status">Noch keine hinterlegt.</p>}
    </Karte>
  );
}
