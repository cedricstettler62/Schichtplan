import { useState } from "react";
import PasswordForm from "../../components/PasswordForm.jsx";
import { emailProblem } from "#shared/email.js";

/**
 * Eigener Zugang der Verwaltung: der Code, mit dem sie sich statt eines
 * Firmencodes anmeldet, eine optionale Kontaktadresse und das eigene
 * Passwort — dieselbe Selbstverwaltung wie bei Mitarbeitenden und Admins,
 * nur ohne Konten-Liste, denn es gibt nur diesen einen Zugang.
 */
export default function SuperAdminSettingsTab({ code, email, verifySelf, onChangeCode, onChangeEmail, onChangePassword }) {
  const [codeValue, setCodeValue] = useState(code || "");
  const [codeError, setCodeError] = useState("");
  const [codeSaved, setCodeSaved] = useState(false);

  const [emailValue, setEmailValue] = useState(email || "");
  const [emailError, setEmailError] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);

  const submitCode = async () => {
    const trimmed = codeValue.trim();
    if (!/^\d{6}$/.test(trimmed)) { setCodeError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    const meldung = await onChangeCode(trimmed);
    if (meldung) { setCodeError(meldung); setCodeSaved(false); return; }
    setCodeError("");
    setCodeSaved(true);
    setTimeout(() => setCodeSaved(false), 2000);
  };

  const submitEmail = async () => {
    const problem = emailProblem(emailValue);
    if (problem) { setEmailError(problem); return; }
    const meldung = await onChangeEmail(emailValue.trim());
    if (meldung) { setEmailError(meldung); setEmailSaved(false); return; }
    setEmailError("");
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2000);
  };

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Einstellungen</h2>
          <p className="sb-tab-intro">Zugang und Kontaktangabe der Verwaltung.</p>
        </div>
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">Firmencode</h3>
        <p className="sb-tab-intro">
          Der Code, mit dem du dich statt eines Firmencodes anmeldest. Muss sich von jedem
          vergebenen Firmencode unterscheiden.
        </p>
        <div className="sb-inline-add">
          <input
            value={codeValue}
            onChange={(e) => setCodeValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && submitCode()}
            placeholder="6 Ziffern"
            inputMode="numeric"
            className="sb-mono"
            aria-label="Firmencode der Verwaltung"
          />
          <button type="button" className="sb-btn sb-btn-ink" onClick={submitCode}>Speichern</button>
        </div>
        {codeSaved && <p className="sb-saved-note">Gespeichert.</p>}
        {codeError && <p className="sb-error">{codeError}</p>}
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">E-Mail-Adresse</h3>
        <p className="sb-tab-intro">Rein optional, als Kontaktangabe — die Verwaltung bekommt selbst keine Schicht zugeteilt.</p>
        <div className="sb-inline-add">
          <input
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitEmail()}
            placeholder="name@beispiel.ch"
            aria-label="E-Mail-Adresse der Verwaltung"
          />
          <button type="button" className="sb-btn sb-btn-ink" onClick={submitEmail}>Speichern</button>
        </div>
        {emailSaved && <p className="sb-saved-note">Gespeichert.</p>}
        {emailError && <p className="sb-error">{emailError}</p>}
      </div>

      <PasswordForm verify={verifySelf} onSubmit={onChangePassword} />
    </div>
  );
}
