import { useState } from "react";

export default function NewCompanyForm({ onCreate }) {
  const [companyName, setCompanyName] = useState("");
  const [code, setCode] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [ohneMail, setOhneMail] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmedCode = code.trim();
    if (!companyName.trim()) { setError("Bitte einen Namen für das Unternehmen angeben."); return; }
    if (!/^\d{6}$/.test(trimmedCode)) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!adminName.trim() || !adminEmail.trim()) { setError("Bitte Name und E-Mail des Admin-Kontos ausfüllen."); return; }
    setError("");

    const message = await onCreate({
      name: companyName.trim(),
      code: trimmedCode,
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim(),
      notify: !ohneMail,
    });
    if (message) { setError(message); return; }

    setCompanyName(""); setCode(""); setAdminName(""); setAdminEmail(""); setOhneMail(false);
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
          <label className="sb-field"><span>E-Mail</span><input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></label>
        </div>
      </div>

      {error && <p className="sb-error">{error}</p>}
      <label className="sb-checkbox-row">
        <input type="checkbox" checked={ohneMail} onChange={(e) => setOhneMail(e.target.checked)} />
        <span>Erstellen ohne Benachrichtigung</span>
      </label>
      <div className="sb-form-actions">
        <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Unternehmen anlegen</button>
        <span className="sb-status">
          {ohneMail
            ? "Du bekommst den Einladungslink danach angezeigt."
            : "Das Admin-Konto erhält per E-Mail einen Link, über den es sein Passwort selbst setzt."}
        </span>
      </div>
    </div>
  );
}
