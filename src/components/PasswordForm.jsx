import { useState } from "react";

/**
 * Passwort setzen — für das eigene Konto und für ein fremdes.
 *
 * Beide Fälle laufen gleich: erst das *eigene* Passwort bestätigen, dann das
 * neue zweimal eingeben. Beim fremden Konto ist die Bestätigung sogar zwingend
 * dieselbe, denn das fremde Passwort kennt niemand. Unterschiedlich sind nur
 * die Beschriftungen und der Hinweis am Ende.
 *
 * `onSubmit(neuesPasswort, eigenesPasswort)` gibt null zurück, wenn es geklappt
 * hat, sonst die Meldung des Servers.
 */
export default function PasswordForm({
  verify,
  onSubmit,
  fremd = false,
  bestaetigungLabel = fremd ? "Dein Passwort zur Bestätigung" : "Aktuelles Passwort",
  hinweis = fremd ? "Gib das neue Passwort persönlich weiter – geschrieben bleibt es irgendwo liegen." : null,
}) {
  const [eigenes, setEigenes] = useState("");
  const [bestaetigt, setBestaetigt] = useState(false);
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const submitVerify = async () => {
    if (!(await verify(eigenes))) {
      setError(fremd ? "Das Passwort ist falsch." : "Das aktuelle Passwort ist falsch.");
      setBestaetigt(false);
      return;
    }
    setError("");
    setBestaetigt(true);
  };

  const submitPassword = async () => {
    if (neu.length < 4) { setError("Das Passwort muss mindestens 4 Zeichen haben."); setSaved(false); return; }
    if (neu !== wiederholung) { setError("Die Passwörter stimmen nicht überein."); setSaved(false); return; }

    /* Erst melden, wenn der Server zugestimmt hat. Vorher stand hier
       „gespeichert“, egal was zurückkam — ein abgelehnter oder gar nicht
       angekommener Wechsel sah aus wie ein erfolgreicher, und beim nächsten
       Anmelden galt dann das alte Passwort. */
    const meldung = await onSubmit(neu, eigenes);
    if (meldung) { setError(meldung); setSaved(false); return; }

    setError("");
    setNeu(""); setWiederholung(""); setEigenes(""); setBestaetigt(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className={fremd ? "sb-stack" : "sb-card"}>
      {!fremd && (
        <>
          <h3 className="sb-subheading">Passwort ändern</h3>
          <p className="sb-tab-intro">Zuerst das aktuelle Passwort bestätigen, danach das neue zweimal eingeben.</p>
        </>
      )}

      <div className="sb-form-grid">
        <label className="sb-field">
          <span>{bestaetigungLabel}</span>
          <input
            type="password"
            value={eigenes}
            onChange={(e) => { setEigenes(e.target.value); setBestaetigt(false); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitVerify()}
            autoComplete="current-password"
          />
        </label>
        {!bestaetigt && (
          <div className="sb-field sb-field-btn">
            <button type="button" className="sb-btn sb-btn-ink" onClick={submitVerify}>Bestätigen</button>
          </div>
        )}
      </div>

      {bestaetigt && (
        <div className="sb-password-expand">
          <div className="sb-form-grid">
            <label className="sb-field">
              <span>Neues Passwort</span>
              <input
                type="password"
                value={neu}
                onChange={(e) => setNeu(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitPassword()}
                autoComplete="new-password"
              />
            </label>
            <label className="sb-field">
              <span>Wiederholen</span>
              <input
                type="password"
                value={wiederholung}
                onChange={(e) => setWiederholung(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitPassword()}
                autoComplete="new-password"
              />
            </label>
            <div className="sb-field sb-field-btn">
              <button type="button" className="sb-btn sb-btn-ink" onClick={submitPassword}>
                {fremd ? "Passwort setzen" : "Speichern"}
              </button>
            </div>
          </div>
          {hinweis && <p className="sb-status">{hinweis}</p>}
        </div>
      )}

      {error && <p className="sb-error">{error}</p>}
      {saved && <p className="sb-saved-note">{fremd ? "Neues Passwort gesetzt." : "Passwort gespeichert."}</p>}
    </div>
  );
}
