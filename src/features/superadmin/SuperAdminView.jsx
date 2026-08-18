import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import CompanyRow from "./CompanyRow.jsx";
import NewCompanyForm from "./NewCompanyForm.jsx";
import SystemPanel from "./SystemPanel.jsx";

/** `companies` sind hier Kurzfassungen: { id, code, name, adminCount, employeeCount }. */
export default function SuperAdminView({
  companies, superAdminName, onCreateCompany, onDeleteCompany, onUpdateCompanyName,
  onLoadAdmins, onLoadEmployees, onResetAdminPassword, onDeleteAdmin, onLoadLogbook, onDataChanged, onLogout,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [angelegt, setAngelegt] = useState(null);

  const createCompany = async (data) => {
    const res = await onCreateCompany(data);
    if (res?.error) return res.error;

    setFormOpen(false);
    setAngelegt({ name: data.name, code: data.code, adminName: data.adminName });
    return null;
  };

  return (
    <div className="sb-app">
      <header className="sb-header">
        <div className="sb-header-top">
          <h1 className="sb-app-title sb-app-title-sm">Schichtboard – Verwaltung</h1>
          <div className="sb-header-user">
            <span className="sb-header-name">{superAdminName}</span>
            <Badge tone="rust">Verwaltung</Badge>
            <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={onLogout}>Abmelden</button>
          </div>
        </div>
      </header>
      <main>
        <div className="sb-tab">
          <div className="sb-tab-head">
            <div className="sb-tab-head-text">
              <h2 className="sb-tab-head-title">Unternehmen</h2>
              <p className="sb-tab-intro">Alle Unternehmen im System, jeweils identifiziert durch ihren sechsstelligen Firmencode.</p>
            </div>
            <button type="button" className={`sb-btn ${formOpen ? "sb-btn-quiet" : "sb-btn-amber"}`} onClick={() => setFormOpen((o) => !o)}>
              {formOpen ? "Abbrechen" : "Neues Unternehmen"}
            </button>
          </div>
          {formOpen && <NewCompanyForm onCreate={createCompany} />}

          {angelegt && (
            <div className="sb-card">
              <p className="sb-saved-note">
                „{angelegt.name}“ angelegt. {angelegt.adminName} meldet sich mit Firmencode{" "}
                <span className="sb-mono">{angelegt.code}</span> und dem eben vergebenen Passwort an.
              </p>
              <div className="sb-form-actions">
                <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setAngelegt(null)}>
                  Ausblenden
                </button>
              </div>
            </div>
          )}

          <div className="sb-card">
            <div className="sb-manage-list">
              {companies.length === 0 && <p className="sb-empty">Noch keine Unternehmen angelegt.</p>}
              {companies.map((c) => (
                <CompanyRow
                  key={c.id}
                  company={c}
                  onDelete={onDeleteCompany}
                  onUpdateName={onUpdateCompanyName}
                  onLoadAdmins={onLoadAdmins}
                  onLoadEmployees={onLoadEmployees}
                  onResetAdminPassword={onResetAdminPassword}
                  onDeleteAdmin={onDeleteAdmin}
                  onLoadLogbook={onLoadLogbook}
                />
              ))}
            </div>
          </div>

          <SystemPanel onDataChanged={onDataChanged} />
        </div>
      </main>
    </div>
  );
}
