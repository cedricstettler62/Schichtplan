import { useState } from "react";
import EinladungsLink from "../../components/EinladungsLink.jsx";
import EmployeeManageRow from "./EmployeeManageRow.jsx";

export default function EmployeesTab({
  accounts, qualifications, verifyAdmin,
  onAddEmployee, onUpdateEmail, onResetPassword, onSetQualification, onDeleteAccount, onPromote,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ohneMail, setOhneMail] = useState(false);
  const [error, setError] = useState("");
  const [einladung, setEinladung] = useState(null); // { link, hinweis }

  const employees = accounts.filter((a) => a.role === "employee");

  const submitEmployee = async () => {
    if (!name.trim() || !email.trim()) { setError("Bitte Name und E-Mail ausfüllen."); return; }
    setError("");
    const adresse = email.trim();
    const res = await onAddEmployee({ name: name.trim(), email: adresse, notify: !ohneMail });
    if (!res) { setError("Das Konto konnte nicht angelegt werden."); return; }

    /* Sagt, was wirklich passiert ist. Ein „Konto angelegt“ allein liesse den
       Admin glauben, die Einladung sei unterwegs — auch wenn gar kein Versand
       eingerichtet ist. */
    setEinladung({
      link: res.link,
      hinweis: ohneMail
        ? "Konto angelegt. Es wurde nichts verschickt – gib diesen Link persönlich weiter, darüber setzt die Person ihr Passwort."
        : res.benachrichtigt
          ? `Konto angelegt. Die Einladung ist an ${adresse} unterwegs. Falls sie nicht ankommt, hilft dieser Link weiter:`
          : "Konto angelegt, aber die E-Mail ging nicht raus. Gib diesen Link persönlich weiter:",
    });
    setName(""); setEmail(""); setOhneMail(false);
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
          </div>
          {error && <p className="sb-error">{error}</p>}
          <label className="sb-checkbox-row">
            <input type="checkbox" checked={ohneMail} onChange={(e) => setOhneMail(e.target.checked)} />
            <span>Erstellen ohne Benachrichtigung</span>
          </label>
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-ink" onClick={submitEmployee}>Konto anlegen</button>
            <span className="sb-status">
              {ohneMail
                ? "Du bekommst den Einladungslink danach hier angezeigt."
                : "Die Person erhält per E-Mail einen Link, über den sie ihr Passwort selbst setzt."}
            </span>
          </div>
        </div>
      )}

      {einladung && (
        <div className="sb-card">
          <EinladungsLink link={einladung.link} hinweis={einladung.hinweis} />
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setEinladung(null)}>
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
