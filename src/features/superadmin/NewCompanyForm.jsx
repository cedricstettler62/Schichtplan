import { useState } from "react";

export default function NewCompanyForm({ onCreate }) {
  const [companyName, setCompanyName] = useState("");
  const [code, setCode] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmedCode = code.trim();
    if (!companyName.trim()) { setError("Bitte einen Namen für das Unternehmen angeben."); return; }
    if (!/^\d{6}$/.test(trimmedCode)) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) { setError("Bitte alle Admin-Zugangsdaten ausfüllen."); return; }
    setError("");

    const message = await onCreate({
      name: companyName.trim(),
      code: trimmedCode,
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim(),
      adminPassword: adminPassword.trim(),
    });
    if (message) { setError(message); return; }

    setCompanyName(""); setCode(""); setAdminName(""); setAdminEmail(""); setAdminPassword("");
  };

  return (
    <div className="sb-card sb-form">
      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Name des Unternehmens</span>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="z. B. Muster GmbH" />
        </label>
        <label className="sb-field">
          <span>Firmencode (6-stellig)</span>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="z. B. 222222" className="sb-mono" inputMode="numeric" />
        </label>
        <label className="sb-field"><span>Name (Admin)</span><input value={adminName} onChange={(e) => setAdminName(e.target.value)} /></label>
        <label className="sb-field"><span>E-Mail (Admin)</span><input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></label>
        <label className="sb-field"><span>Passwort (Admin)</span><input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></label>
      </div>
      {error && <p className="sb-error">{error}</p>}
      <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Unternehmen anlegen</button>
    </div>
  );
}
