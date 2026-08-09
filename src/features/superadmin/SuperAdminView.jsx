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

          <div className="sb-card">
            <div className="sb-manage-list">
              {companies.length === 0 && <p className="sb-empty">Noch keine Unternehmen angelegt.</p>}
              {companies.map((c) => <CompanyRow key={c.id} company={c} onDelete={onDeleteCompany} onUpdateName={onUpdateCompanyName} />)}
            </div>
          </div>

          <SystemPanel onDataChanged={onDataChanged} />
        </div>
      </main>
    </div>
  );
}
