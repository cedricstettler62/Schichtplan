import { useState } from "react";
import EmployeeManageRow from "./EmployeeManageRow.jsx";

export default function EmployeesTab({
  accounts, qualifications, verifyAdmin,
  onAddEmployee, onResetPassword, onSetQualification, onDeleteAccount, onPromote,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [error, setError] = useState("");
  const [angelegt, setAngelegt] = useState("");

  const employees = accounts.filter((a) => a.role === "employee");

  const submitEmployee = async () => {
    if (!name.trim()) { setError("Bitte einen Namen eingeben."); return; }
    if (passwort.length < 4) { setError("Das Passwort braucht mindestens 4 Zeichen."); return; }
    if (passwort !== wiederholung) { setError("Die beiden Passwörter stimmen nicht überein."); return; }
    setError("");

    const res = await onAddEmployee({ name: name.trim(), password: passwort });
    if (!res) { setError("Das Konto konnte nicht angelegt werden."); return; }

    setAngelegt(name.trim());
    setName(""); setPasswort(""); setWiederholung("");
    setFormOpen(false);
  };

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Mitarbeitende</h2>
          <p className="sb-tab-intro">Konten anlegen, Qualifikationen vergeben und Zugänge verwalten.</p>
        </div>
        <button type="button" className={`sb-btn ${formOpen ? "sb-btn-quiet" : "sb-btn-amber"}`} onClick={() => { setFormOpen((o) => !o); setAngelegt(""); }}>
          {formOpen ? "Abbrechen" : "Neues Konto"}
        </button>
      </div>
      {formOpen && (
        <div className="sb-card">
          <span className="sb-detail-label">Neues Mitarbeitendenkonto</span>
          <div className="sb-form-grid">
            <label className="sb-field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} placeholder="Vor- und Nachname" /></label>
            <label className="sb-field"><span>Erstes Passwort</span><input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} autoComplete="new-password" /></label>
            <label className="sb-field"><span>Wiederholen</span><input type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} autoComplete="new-password" /></label>
          </div>
          {error && <p className="sb-error">{error}</p>}
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-ink" onClick={submitEmployee}>Konto anlegen</button>
            <span className="sb-status">
              Gib Firmencode, Name und dieses Passwort persönlich weiter. Ändern kann die Person es danach selbst.
            </span>
          </div>
        </div>
      )}

      {angelegt && (
        <div className="sb-card">
          <p className="sb-saved-note">Konto für {angelegt} angelegt.</p>
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setAngelegt("")}>
              Ausblenden
            </button>
          </div>
        </div>
      )}

      <div className="sb-card">
        <h3 className="sb-subheading">Alle Mitarbeitenden</h3>
        <div className="sb-manage-list">
          {employees.length === 0 && <p className="sb-empty">Noch keine Mitarbeitenden angelegt.</p>}
          {employees.map((a) => (
            <EmployeeManageRow
              key={a.id}
              account={a}
              qualifications={qualifications}
              verifyAdmin={verifyAdmin}
              onResetPassword={onResetPassword}
              onSetQualification={onSetQualification}
              onDeleteAccount={onDeleteAccount}
              onPromote={onPromote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
