import { useState } from "react";
import EmployeeManageRow from "./EmployeeManageRow.jsx";
import { PASSWORD_HINWEIS, passwortProblem } from "#shared/password.js";

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
  /* Gleiche Namen sind erlaubt — zwei Menschen dürfen gleich heissen. Nur muss
     dann das Passwort ein anderes sein, sonst landet jede Anmeldung beim ersten
     der beiden Konten und das zweite bleibt unerreichbar. */
  const namensdopplung =
    name.trim() && accounts.some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());

  const submitEmployee = async () => {
    if (!name.trim()) { setError("Bitte einen Namen eingeben."); return; }
    const passwortFehler = passwortProblem(passwort);
    if (passwortFehler) { setError(passwortFehler); return; }
    if (passwort !== wiederholung) { setError("Die beiden Passwörter stimmen nicht überein."); return; }
    setError("");

    const meldung = await onAddEmployee({ name: name.trim(), password: passwort });
    if (meldung) { setError(meldung); return; }

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
            <div className="sb-field-wrap">
              <label className="sb-field">
                <span>Erstes Passwort</span>
                <input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} autoComplete="new-password" />
              </label>
              <span className="sb-field-hint">{PASSWORD_HINWEIS}</span>
            </div>
            <label className="sb-field"><span>Wiederholen</span><input type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} autoComplete="new-password" /></label>
          </div>
          {namensdopplung && (
            <p className="sb-status">
              Es gibt bereits ein Konto mit diesem Namen. Das ist möglich – vergib aber ein anderes
              Passwort als dort, sonst ist eines der beiden Konten nicht mehr erreichbar.
            </p>
          )}
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
