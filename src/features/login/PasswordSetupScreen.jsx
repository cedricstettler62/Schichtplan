import { useEffect, useState } from "react";
import { PASSWORD_HINWEIS, passwortProblem } from "#shared/password.js";
import { ApiError, passwordSetupInfo, submitPasswordSetup } from "../../api.js";

/**
 * Die Seite hinter dem Einladungslink, den eine von der Administration neu
 * angelegte Person per Mail bekommt (siehe server/passwordSetup.js) — ohne
 * Anmeldung erreichbar, das Zeichen im Pfad ist hier der Zugang.
 */
export default function PasswordSetupScreen({ token }) {
  const [status, setStatus] = useState("laden"); // "laden" | "ungueltig" | "formular" | "fertig"
  const [info, setInfo] = useState(null);

  useEffect(() => {
    passwordSetupInfo(token)
      .then((res) => { setInfo(res); setStatus("formular"); })
      .catch(() => setStatus("ungueltig"));
  }, [token]);

  return (
    <div className="sb-login-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        <p className="sb-login-sub">Passwort einrichten</p>
      </div>

      {status === "laden" && <div className="sb-card sb-login-card" />}

      {status === "ungueltig" && (
        <div className="sb-card sb-login-card sb-pending-card" role="status">
          <h2 className="sb-pending-title">Dieser Link ist ungültig oder abgelaufen</h2>
          <p className="sb-pending-text">
            Bitte wende dich an deine Administration — sie kann dir einen neuen Zugang einrichten.
          </p>
        </div>
      )}

      {status === "formular" && <SetupForm token={token} info={info} onFertig={() => setStatus("fertig")} />}

      {status === "fertig" && (
        <div className="sb-card sb-login-card sb-pending-card" role="status">
          <h2 className="sb-pending-title">Passwort eingerichtet</h2>
          <p className="sb-pending-text">Du kannst dich jetzt mit Firmencode, Namen und diesem Passwort anmelden.</p>
          <a className="sb-btn sb-btn-ink sb-login-btn" href="/">Zur Anmeldung</a>
        </div>
      )}
    </div>
  );
}

function SetupForm({ token, info, onFertig }) {
  const [password, setPassword] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) { setError(passwortFehler); return; }
    if (password !== wiederholung) { setError("Die beiden Passwörter stimmen nicht überein."); return; }

    setBusy(true);
    try {
      await submitPasswordSetup(token, password);
      onFertig();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="sb-card sb-login-card">
      <p className="sb-status">
        Hallo {info.name} — richte dein erstes Passwort für {info.companyName} ein.
      </p>
      <div className="sb-form-grid sb-form-grid-1col">
        <div className="sb-field-wrap">
          <label className="sb-field">
            <span>Passwort</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="new-password"
              autoFocus
            />
          </label>
          <span className="sb-field-hint">{PASSWORD_HINWEIS}</span>
        </div>
        <label className="sb-field">
          <span>Passwort wiederholen</span>
          <input
            type="password"
            value={wiederholung}
            onChange={(e) => setWiederholung(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="new-password"
          />
        </label>
      </div>
      {error && <p className="sb-error">{error}</p>}
      <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={submit} disabled={busy}>
        {busy ? "Wird gespeichert …" : "Passwort setzen"}
      </button>
    </div>
  );
}
