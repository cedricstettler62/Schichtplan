import { useState } from "react";
import EmployeeManageRow from "./EmployeeManageRow.jsx";
import TabHead, { NeuKnopf } from "../../components/TabHead.jsx";
import Karte from "../../components/Karte.jsx";
import { emailProblem } from "#shared/email.js";

export default function EmployeesTab({
  accounts, qualifications, verifyAdmin,
  onAddEmployee, onResetPassword, onSetQualification, onDeleteAccount, onPromote,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [angelegt, setAngelegt] = useState("");

  const employees = accounts.filter((a) => a.role === "employee");

  const submitEmployee = async () => {
    if (!name.trim()) { setError("Bitte einen Namen eingeben."); return; }
    const mailFehler = emailProblem(email, { required: true });
    if (mailFehler) { setError(mailFehler); return; }
    setError("");

    const meldung = await onAddEmployee({ name: name.trim(), email: email.trim() });
    if (meldung) { setError(meldung); return; }

    setAngelegt(name.trim());
    setName(""); setEmail("");
    setFormOpen(false);
  };

  return (
    <div className="sb-tab">
      <TabHead titel="Mitarbeitende" intro="Konten anlegen, Qualifikationen vergeben und Zugänge verwalten.">
        <NeuKnopf
          offen={formOpen}
          onClick={() => { setFormOpen((o) => !o); setAngelegt(""); }}
          label="Neues Konto"
        />
      </TabHead>
      {formOpen && (
        <div className="sb-card">
          <span className="sb-detail-label">Neues Mitarbeitendenkonto</span>
          <div className="sb-form-grid">
            <label className="sb-field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} placeholder="Vor- und Nachname" /></label>
            <div className="sb-field-wrap">
              <label className="sb-field">
                <span>E-Mail-Adresse</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} placeholder="name@beispiel.ch" />
              </label>
              <span className="sb-field-hint">
                Dorthin geht der Link, mit dem die Person ihr eigenes Passwort einrichtet, und später auch
                die Benachrichtigung bei einer neuen Zuteilung.
              </span>
            </div>
          </div>
          {error && <p className="sb-error">{error}</p>}
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-ink" onClick={submitEmployee}>Konto anlegen</button>
            <span className="sb-status">
              Ein Passwort legst du nicht fest — die Person richtet ihr eigenes über den Link in der Mail ein.
            </span>
          </div>
        </div>
      )}

      {angelegt && (
        <div className="sb-card">
          <p className="sb-saved-note">Konto für {angelegt} angelegt — die Einladungsmail ist unterwegs.</p>
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setAngelegt("")}>
              Ausblenden
            </button>
          </div>
        </div>
      )}

      <Karte titel="Alle Mitarbeitenden">
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
      </Karte>
    </div>
  );
}
