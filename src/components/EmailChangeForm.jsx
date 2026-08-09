import { useState } from "react";

/** Passwortbestätigung, danach E-Mail-Feld. Siehe PasswordChangeForm zu `verify`. */
export default function EmailChangeForm({ verify, initialEmail, onSave }) {
  const [currentPw, setCurrentPw] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [saved, setSaved] = useState(false);

  const submitVerify = async () => {
    const ok = await verify(currentPw);
    if (!ok) { setVerifyError("Das Passwort ist falsch."); setVerified(false); return; }
    setVerifyError("");
    setVerified(true);
  };

  const submitEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    await onSave(trimmed, currentPw);
    setSaved(true);
    setCurrentPw(""); setVerified(false);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="sb-stack">
      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Passwort zur Bestätigung</span>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => { setCurrentPw(e.target.value); setVerified(false); setVerifyError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitVerify()}
            autoComplete="current-password"
          />
        </label>
        {!verified && <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitVerify}>Bestätigen</button></div>}
      </div>
      {verifyError && <p className="sb-error">{verifyError}</p>}

      {verified && (
        <div className="sb-password-expand">
          <div className="sb-form-grid">
            <label className="sb-field">
              <span>Neue E-Mail-Adresse</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmail()} />
            </label>
            <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitEmail}>Speichern</button></div>
          </div>
        </div>
      )}
      {saved && <p className="sb-saved-note">E-Mail-Adresse gespeichert.</p>}
    </div>
  );
}
