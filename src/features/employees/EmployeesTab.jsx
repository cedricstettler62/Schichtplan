import { useState } from "react";
import EmployeeManageRow from "./EmployeeManageRow.jsx";

export default function EmployeesTab({
  accounts, qualifications, verifyAdmin,
  onAddEmployee, onUpdateEmail, onResetPassword, onSetQualification, onDeleteAccount, onPromote,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const employees = accounts.filter((a) => a.role === "employee");

  const submitEmployee = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Bitte alle Felder ausfüllen."); return; }
    setError("");
    await onAddEmployee({ name: name.trim(), email: email.trim(), password: password.trim() });
    setName(""); setEmail(""); setPassword("");
    setFormOpen(false);
  };

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Mitarbeitende</h2>
          <p className="sb-tab-intro">Konten anlegen, Qualifikationen vergeben und Zugänge verwalten.</p>
        </div>
        <button type="button" className={`sb-btn ${formOpen ? "sb-btn-quiet" : "sb-btn-amber"}`} onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Abbrechen" : "Neues Konto"}
        </button>
      </div>
      {formOpen && (
        <div className="sb-card">
          <span className="sb-detail-label">Neues Mitarbeitendenkonto</span>
          <div className="sb-form-grid">
            <label className="sb-field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} placeholder="Vor- und Nachname" /></label>
            <label className="sb-field"><span>E-Mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
            <label className="sb-field"><span>Startpasswort</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
          </div>
          {error && <p className="sb-error">{error}</p>}
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-ink" onClick={submitEmployee}>Konto anlegen</button>
            <span className="sb-status">Das Passwort kann die Person später selbst ändern.</span>
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
              onUpdateEmail={onUpdateEmail}
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
