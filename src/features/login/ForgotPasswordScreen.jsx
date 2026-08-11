import { useState } from "react";
import { api } from "../../api.js";

/*
 * Gefragt wird nach Firmencode und E-Mail, nicht nach dem Namen: Namen sind
 * im Schichtboard nicht eindeutig, die Anmeldung selbst prüft mehrere Konten
 * gleichen Namens durch.
 *
 * Die Antwort ist immer dieselbe. Stünde hier „kein Konto gefunden“, liesse
 * sich damit die Belegschaft einer Firma abfragen.
 */
export default function ForgotPasswordScreen({ onBack }) {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [gesendet, setGesendet] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!email.trim()) { setError("Bitte die E-Mail-Adresse des Kontos eingeben."); return; }

    setBusy(true);
    try {
      await api.post("/password-reset/request", { code: code.trim(), email: email.trim() });
      setError("");
      setGesendet(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="sb-login-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        <p className="sb-login-sub">Passwort vergessen? Wir schicken dir einen Link.</p>
      </div>
      <div className="sb-card sb-login-card">
        {gesendet ? (
          <>
            <p className="sb-status">
              Falls es zu diesen Angaben ein Konto gibt, ist eine E-Mail mit einem Link unterwegs.
              Der Link gilt eine Stunde.
            </p>
            <p className="sb-status">
              Nichts angekommen? Dann prüfe den Spam-Ordner – oder wende dich an einen Admin,
              der dir direkt ein neues Passwort setzen kann.
            </p>
            <button type="button" className="sb-btn sb-btn-quiet sb-login-btn" onClick={onBack}>
              Zurück zur Anmeldung
            </button>
          </>
        ) : (
          <>
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
                <span>E-Mail-Adresse des Kontos</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKey} autoComplete="email" />
              </label>
            </div>
            {error && <p className="sb-error">{error}</p>}
            <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={submit} disabled={busy}>
              {busy ? "Wird verschickt …" : "Link anfordern"}
            </button>
            <button type="button" className="sb-btn sb-btn-quiet sb-login-btn" onClick={onBack}>
              Zurück zur Anmeldung
            </button>
          </>
        )}
      </div>
    </div>
  );
}
