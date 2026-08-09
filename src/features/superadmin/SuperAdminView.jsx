import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import CompanyRow from "./CompanyRow.jsx";
import NewCompanyForm from "./NewCompanyForm.jsx";
import SystemPanel from "./SystemPanel.jsx";

/** `companies` sind hier Kurzfassungen: { id, code, name, adminCount, employeeCount }. */
export default function SuperAdminView({ companies, superAdminName, onCreateCompany, onDeleteCompany, onUpdateCompanyName, onDataChanged, onLogout }) {
  const [formOpen, setFormOpen] = useState(false);

  const createCompany = async (data) => {
    const message = await onCreateCompany(data);
    if (!message) setFormOpen(false);
    return message;
  };

  return (
    <div className="sb-app">
      <div className="sb-header">
        <div className="sb-header-top">
          <h1 className="sb-app-title sb-app-title-sm">Schichtboard – Verwaltung</h1>
          <div className="sb-header-user">
            <span>{superAdminName}</span>
            <Badge tone="rust">Verwaltung</Badge>
            <button type="button" className="sb-link-btn" onClick={onLogout}>Abmelden</button>
          </div>
        </div>
      </div>
      <main className="sb-main">
        <div className="sb-tab">
          <p className="sb-tab-intro">Übersicht aller Unternehmen im System, jeweils identifiziert durch ihren Firmencode.</p>

          <div className="sb-tab-toolbar">
            <button type="button" className="sb-btn sb-btn-amber" onClick={() => setFormOpen((o) => !o)}>
              {formOpen ? "Formular schliessen" : "+ Neues Unternehmen"}
            </button>
          </div>
          {formOpen && <NewCompanyForm onCreate={createCompany} />}

          <div className="sb-card">
            <h3 className="sb-subheading">Unternehmen</h3>
            <div className="sb-manage-list">
              {companies.length === 0 && <p className="sb-empty">Noch keine Unternehmen vorhanden.</p>}
              {companies.map((c) => <CompanyRow key={c.id} company={c} onDelete={onDeleteCompany} onUpdateName={onUpdateCompanyName} />)}
            </div>
          </div>

          <SystemPanel onDataChanged={onDataChanged} />
        </div>
      </main>
    </div>
  );
}
