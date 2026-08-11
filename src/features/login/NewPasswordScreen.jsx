import { useEffect, useState } from "react";
import { api } from "../../api.js";

/*
 * Die Seite hinter dem Link aus der E-Mail. Erreichbar ist die Adresse für
 * jeden — geschützt ist sie durch das Token, nicht durch Unauffindbarkeit.
 * Deshalb wird es zuerst geprüft, bevor überhaupt ein Formular erscheint.
 */
export default function NewPasswordScreen({ token, onDone }) {
  const [status, setStatus] = useState("pruefen"); // pruefen | offen | ungueltig | fertig
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    api
      .get(`/password-reset/${encodeURIComponent(token)}`)
      .then((res) => { if (!abgebrochen) setStatus(res?.valid ? "offen" : "ungueltig"); })
      .catch(() => { if (!abgebrochen) setStatus("ungueltig"); });
    return () => { abgebrochen = true; };
  }, [token]);

  const submit = async () => {
    if (passwort.length < 4) { setError("Mindestens 4 Zeichen."); return; }
    if (passwort !== wiederholung) { setError("Die beiden Passwörter stimmen nicht überein."); return; }

    setBusy(true);
    try {
      await api.post(`/password-reset/${encodeURIComponent(token)}`, { password: passwort });
      setStatus("fertig");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sb-login-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        <p className="sb-login-sub">Neues Passwort festlegen</p>
      </div>
      <div className="sb-card sb-login-card">
        {status === "pruefen" && <p className="sb-status">Link wird geprüft …</p>}

        {status === "ungueltig" && (
          <>
            <p className="sb-error">
              Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere unter „Passwort vergessen“
              einen neuen an.
            </p>
            <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={onDone}>
              Zur Anmeldung
            </button>
          </>
        )}

        {status === "offen" && (
          <>
            <div className="sb-form-grid sb-form-grid-1col">
              <label className="sb-field">
                <span>Neues Passwort</span>
                <input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="new-password" />
              </label>
              <label className="sb-field">
                <span>Wiederholen</span>
                <input
                  type="password"
                  value={wiederholung}
                  onChange={(e) => setWiederholung(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  autoComplete="new-password"
                />
              </label>
            </div>
            {error && <p className="sb-error">{error}</p>}
            <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={submit} disabled={busy}>
              {busy ? "Wird gespeichert …" : "Passwort setzen"}
            </button>
          </>
        )}

        {status === "fertig" && (
          <>
            <p className="sb-saved-note">Dein Passwort ist gesetzt. Du kannst dich jetzt anmelden.</p>
            <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={onDone}>
              Zur Anmeldung
            </button>
          </>
        )}
      </div>
    </div>
  );
}
