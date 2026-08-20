import { useState } from "react";
import { emailProblem } from "#shared/email.js";
import { PASSWORD_HINWEIS, passwortProblem } from "#shared/password.js";

/**
 * `onLogin(code, name, password)` liefert bei Erfolg null, bei einem
 * unbestätigten Konto `{ pending: true }`, sonst `{ message }`.
 * `onRegister(code, name, password, email)` liefert null bei Erfolg, sonst
 * eine Fehlermeldung — das neue Konto entsteht dabei als 'pending' und meldet
 * sich nicht selbst an.
 */
export default function LoginScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "pending"

  const zurueckZurAnmeldung = () => setMode("login");

  return (
    <div className="sb-login-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        {mode !== "pending" && (
          <p className="sb-login-sub">
            {mode === "register"
              ? "Eigenes Konto erstellen — ein Admin deines Unternehmens muss es danach bestätigen."
              : "Mit Firmencode, Name und Passwort anmelden."}
          </p>
        )}
      </div>

      {mode === "login" && <AnmeldeForm onLogin={onLogin} onWechsel={() => setMode("register")} onPending={() => setMode("pending")} />}
      {mode === "register" && (
        <RegistrierungsForm onRegister={onRegister} onFertig={() => setMode("pending")} onAbbrechen={zurueckZurAnmeldung} />
      )}
      {mode === "pending" && <WartetAufBestaetigung onZurueck={zurueckZurAnmeldung} />}
    </div>
  );
}

/* Anmelden und Registrieren fragen dieselben ersten beiden Angaben ab. Zwei
   Fassungen davon liefen mit dem nächsten Feinschliff auseinander — etwa wenn
   der Code hier auf sechs Ziffern beschnitten würde und dort nicht. */
function CodeUndName({ code, setCode, name, setName, onEnter }) {
  const handleKey = (e) => { if (e.key === "Enter") onEnter(); };
  return (
    <>
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
    </>
  );
}

function AnmeldeForm({ onLogin, onWechsel, onPending }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!name.trim() || !password.trim()) { setError("Bitte Name und Passwort eingeben."); return; }

    setBusy(true);
    const result = await onLogin(code.trim(), name.trim(), password);
    setBusy(false);

    if (!result) { setError(""); return; }
    if (result.pending) { onPending(); return; }
    setError(result.message || "");
  };

  return (
    <div className="sb-card sb-login-card">
      <div className="sb-form-grid sb-form-grid-1col">
        <CodeUndName code={code} setCode={setCode} name={name} setName={setName} onEnter={submit} />
        <label className="sb-field">
          <span>Passwort</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="current-password" />
        </label>
      </div>
      {error && <p className="sb-error">{error}</p>}
      <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={submit} disabled={busy}>
        {busy ? "Wird angemeldet …" : "Anmelden"}
      </button>
      <p className="sb-status">
        Passwort vergessen? Ein Admin deines Unternehmens setzt dir ein neues.
      </p>
      <button type="button" className="sb-btn sb-btn-quiet sb-login-btn" onClick={onWechsel}>
        Noch kein Konto? Jetzt registrieren
      </button>
    </div>
  );
}

function RegistrierungsForm({ onRegister, onFertig, onAbbrechen }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!name.trim()) { setError("Bitte einen Namen eingeben."); return; }
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) { setError(passwortFehler); return; }
    if (password !== wiederholung) { setError("Die beiden Passwörter stimmen nicht überein."); return; }
    const mailFehler = emailProblem(email, { required: true });
    if (mailFehler) { setError(mailFehler); return; }

    setBusy(true);
    const meldung = await onRegister(code.trim(), name.trim(), password, email.trim());
    setBusy(false);

    if (meldung) { setError(meldung); return; }
    onFertig();
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="sb-card sb-login-card">
      <div className="sb-form-grid sb-form-grid-1col">
        <CodeUndName code={code} setCode={setCode} name={name} setName={setName} onEnter={submit} />
        <label className="sb-field">
          <span>E-Mail-Adresse</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKey} placeholder="name@beispiel.ch" autoComplete="email" />
        </label>
        <div className="sb-field-wrap">
          <label className="sb-field">
            <span>Passwort</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKey} autoComplete="new-password" />
          </label>
          <span className="sb-field-hint">{PASSWORD_HINWEIS}</span>
        </div>
        <label className="sb-field">
          <span>Passwort wiederholen</span>
          <input type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} onKeyDown={handleKey} autoComplete="new-password" />
        </label>
      </div>
      {error && <p className="sb-error">{error}</p>}
      <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={submit} disabled={busy}>
        {busy ? "Wird angelegt …" : "Konto erstellen"}
      </button>
      <button type="button" className="sb-btn sb-btn-quiet sb-login-btn" onClick={onAbbrechen}>
        Ich habe schon ein Konto
      </button>
    </div>
  );
}

/** Grosse, unübersehbare Meldung — direkt nach der Registrierung und wenn
 *  sich jemand mit einem noch unbestätigten Konto anzumelden versucht. */
function WartetAufBestaetigung({ onZurueck }) {
  return (
    <div className="sb-card sb-login-card sb-pending-card" role="status">
      <span className="sb-pending-icon" aria-hidden="true">⏳</span>
      <h2 className="sb-pending-title">Dein Konto wartet auf Bestätigung</h2>
      <p className="sb-pending-text">
        Bevor du dich anmelden kannst, muss zuerst ein Admin deines Unternehmens dein Konto bestätigen.
        Wende dich an deine Administration, falls das länger dauert.
      </p>
      <button type="button" className="sb-btn sb-btn-quiet sb-login-btn" onClick={onZurueck}>
        Zurück zur Anmeldung
      </button>
    </div>
  );
}
