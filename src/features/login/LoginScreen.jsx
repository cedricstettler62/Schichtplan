import { useState } from "react";

/**
 * `onLogin(code, name, password)` liefert null bei Erfolg, sonst eine Fehlermeldung.
 * Ab Phase 2 prüft das der Server; die Firmenliste liegt dann nicht mehr im Browser.
 */
export default function LoginScreen({ onLogin, onForgotPassword }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!name.trim() || !password.trim()) { setError("Bitte Name und Passwort eingeben."); return; }

    setBusy(true);
    const message = await onLogin(code.trim(), name.trim(), password);
    setBusy(false);
    setError(message || "");
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="sb-login-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        <p className="sb-login-sub">Mit Firmencode, Name und Passwort anmelden.</p>
      </div>
      <div className="sb-card sb-login-card">
        <div className="sb-form-grid sb-form-grid-1col">
          <label className="sb-field">
            <span>Firmencode</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={handleKey}
              placeholder="6 Ziffern"
              inputMode="numeric"
              autoComplete="off"
              className="sb-mono"
            />
          </label>
          <label className="sb-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKey} placeholder="Vor- und Nachname" autoComplete="username" />
          </label>
          <label className="sb-field">
            <span>Passwort</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKey} autoComplete="current-password" />
          </label>
        </div>
        {error && <p className="sb-error">{error}</p>}
        <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={submit} disabled={busy}>
          {busy ? "Wird angemeldet …" : "Anmelden"}
        </button>
        <button type="button" className="sb-btn sb-btn-quiet sb-login-btn" onClick={onForgotPassword}>
          Passwort vergessen?
        </button>
      </div>
    </div>
  );
}
