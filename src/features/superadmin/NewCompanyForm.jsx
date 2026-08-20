import { useState } from "react";
import { emailProblem } from "#shared/email.js";
import { PASSWORD_HINWEIS, passwortProblem } from "#shared/password.js";

export default function NewCompanyForm({ onCreate }) {
  const [companyName, setCompanyName] = useState("");
  const [code, setCode] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmedCode = code.trim();
    if (!companyName.trim()) { setError("Bitte einen Namen für das Unternehmen angeben."); return; }
    if (!/^\d{6}$/.test(trimmedCode)) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!adminName.trim()) { setError("Bitte den Namen des Admin-Kontos angeben."); return; }
    const passwortFehler = passwortProblem(adminPassword);
    if (passwortFehler) { setError(passwortFehler); return; }
    if (adminPassword !== wiederholung) { setError("Die beiden Passwörter stimmen nicht überein."); return; }
    const mailFehler = emailProblem(adminEmail, { required: true });
    if (mailFehler) { setError(mailFehler); return; }
    setError("");

    const message = await onCreate({
      name: companyName.trim(),
      code: trimmedCode,
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim(),
      adminPassword,
    });
    if (message) { setError(message); return; }

    setCompanyName(""); setCode(""); setAdminName(""); setAdminEmail(""); setAdminPassword(""); setWiederholung("");
  };

  return (
    <div className="sb-card">
      <div className="sb-form-section">
        <span className="sb-detail-label">Unternehmen</span>
        <div className="sb-form-grid">
          <label className="sb-field">
            <span>Name des Unternehmens</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="z. B. Muster GmbH" />
          </label>
          <label className="sb-field">
            <span>Firmencode</span>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 Ziffern" className="sb-mono" inputMode="numeric" />
          </label>
        </div>
      </div>

      <div className="sb-form-section">
        <span className="sb-detail-label">Erstes Admin-Konto</span>
        <div className="sb-form-grid">
          <label className="sb-field"><span>Name</span><input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Vor- und Nachname" /></label>
          <label className="sb-field">
            <span>E-Mail-Adresse</span>
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="name@beispiel.ch" />
          </label>
          <div className="sb-field-wrap">
            <label className="sb-field">
              <span>Erstes Passwort</span>
              <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <span className="sb-field-hint">{PASSWORD_HINWEIS}</span>
          </div>
          <label className="sb-field"><span>Wiederholen</span><input type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="new-password" /></label>
        </div>
      </div>

      {error && <p className="sb-error">{error}</p>}
      <div className="sb-form-actions">
        <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Unternehmen anlegen</button>
        <span className="sb-status">
          Gib Firmencode, Name und Passwort persönlich weiter. Ändern kann das Admin-Konto es danach selbst.
        </span>
      </div>
    </div>
  );
}
