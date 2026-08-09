import { useState } from "react";
import EmployeeManageRow from "./EmployeeManageRow.jsx";

export default function EmployeesTab({
  accounts, qualifications, verifyAdmin,
  onAddEmployee, onUpdateEmail, onSetQualification, onDeleteAccount, onPromote,
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
      <div className="sb-tab-toolbar">
        <button type="button" className="sb-btn sb-btn-amber" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Formular schliessen" : "+ Mitarbeitende anlegen"}
        </button>
      </div>
      {formOpen && (
        <div className="sb-card sb-form">
          <div className="sb-form-grid">
            <label className="sb-field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
            <label className="sb-field"><span>E-Mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
            <label className="sb-field"><span>Passwort</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
            <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitEmployee}>Anlegen</button></div>
          </div>
          {error && <p className="sb-error">{error}</p>}
        </div>
      )}

      <div className="sb-card">
        <h3 className="sb-subheading">Mitarbeitende verwalten</h3>
        <div className="sb-manage-list">
          {employees.length === 0 && <p className="sb-empty">Keine Mitarbeitenden vorhanden.</p>}
          {employees.map((a) => (
            <EmployeeManageRow
              key={a.id}
              account={a}
              qualifications={qualifications}
              verifyAdmin={verifyAdmin}
              onUpdateEmail={onUpdateEmail}
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
