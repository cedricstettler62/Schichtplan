import { useState } from "react";

/**
 * Erst aktuelles Passwort bestätigen, dann neues setzen.
 * `verify` und `onChangePassword` dürfen Promises zurückgeben — ab Phase 2
 * prüft der Server, statt im Browser zu vergleichen.
 */
export default function PasswordChangeForm({ verify, onChangePassword }) {
  const [currentPw, setCurrentPw] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verified, setVerified] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  const submitVerify = async () => {
    const ok = await verify(currentPw);
    if (!ok) { setVerifyError("Das aktuelle Passwort ist falsch."); setVerified(false); return; }
    setVerifyError("");
    setVerified(true);
  };

  const submitPassword = async () => {
    if (!pw1.trim() || pw1.length < 4) { setPwError("Das Passwort muss mindestens 4 Zeichen haben."); setPwSaved(false); return; }
    if (pw1 !== pw2) { setPwError("Die Passwörter stimmen nicht überein."); setPwSaved(false); return; }
    setPwError("");
    await onChangePassword(pw1, currentPw);
    setPw1(""); setPw2(""); setCurrentPw(""); setVerified(false);
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  };

  return (
    <div className="sb-card sb-form">
      <h3 className="sb-subheading">Passwort ändern</h3>
      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Aktuelles Passwort</span>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => { setCurrentPw(e.target.value); setVerified(false); setVerifyError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitVerify()}
          />
        </label>
        {!verified && <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitVerify}>Bestätigen</button></div>}
      </div>
      {verifyError && <p className="sb-error">{verifyError}</p>}

      {verified && (
        <div className="sb-password-expand">
          <div className="sb-form-grid">
            <label className="sb-field"><span>Neues Passwort</span><input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitPassword()} /></label>
            <label className="sb-field"><span>Wiederholen</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitPassword()} /></label>
            <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitPassword}>Speichern</button></div>
          </div>
          {pwError && <p className="sb-error">{pwError}</p>}
        </div>
      )}
      {pwSaved && <span className="sb-saved-note">Passwort gespeichert.</span>}
    </div>
  );
}
