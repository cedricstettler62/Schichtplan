import { useState } from "react";

/**
 * Setzt das Passwort eines fremden Kontos neu — für den Fall, dass jemand
 * ausgesperrt ist. Bestätigt wird mit dem eigenen Admin-Passwort, denn das
 * fremde kennt niemand.
 */
export default function PasswordResetForm({ verify, onReset }) {
  const [adminPw, setAdminPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [saved, setSaved] = useState(false);

  const submitVerify = async () => {
    if (!(await verify(adminPw))) { setError("Das Passwort ist falsch."); setVerified(false); return; }
    setError("");
    setVerified(true);
  };

  const submitReset = async () => {
    if (neu.length < 4) { setError("Mindestens 4 Zeichen."); return; }
    if (neu !== wiederholung) { setError("Die beiden Passwörter stimmen nicht überein."); return; }
    const meldung = await onReset(neu, adminPw);
    if (meldung) { setError(meldung); return; }
    setError("");
    setSaved(true);
    setAdminPw(""); setNeu(""); setWiederholung(""); setVerified(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="sb-stack">
      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Dein Passwort zur Bestätigung</span>
          <input
            type="password"
            value={adminPw}
            onChange={(e) => { setAdminPw(e.target.value); setVerified(false); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitVerify()}
            autoComplete="current-password"
          />
        </label>
        {!verified && (
          <div className="sb-field sb-field-btn">
            <button type="button" className="sb-btn sb-btn-ink" onClick={submitVerify}>Bestätigen</button>
          </div>
        )}
      </div>

      {verified && (
        <div className="sb-password-expand">
          <div className="sb-form-grid">
            <label className="sb-field">
              <span>Neues Passwort</span>
              <input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="sb-field">
              <span>Wiederholen</span>
              <input
                type="password"
                value={wiederholung}
                onChange={(e) => setWiederholung(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitReset()}
                autoComplete="new-password"
              />
            </label>
            <div className="sb-field sb-field-btn">
              <button type="button" className="sb-btn sb-btn-ink" onClick={submitReset}>Passwort setzen</button>
            </div>
          </div>
          <p className="sb-status">Gib das neue Passwort persönlich weiter – geschrieben bleibt es irgendwo liegen.</p>
        </div>
      )}

      {error && <p className="sb-error">{error}</p>}
      {saved && <p className="sb-saved-note">Neues Passwort gesetzt.</p>}
    </div>
  );
}
