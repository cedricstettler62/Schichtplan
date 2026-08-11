import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import EinladungsLink from "../../components/EinladungsLink.jsx";
import CompanyRow from "./CompanyRow.jsx";
import NewCompanyForm from "./NewCompanyForm.jsx";
import SystemPanel from "./SystemPanel.jsx";

/** `companies` sind hier Kurzfassungen: { id, code, name, adminCount, employeeCount }. */
export default function SuperAdminView({ companies, superAdminName, onCreateCompany, onDeleteCompany, onUpdateCompanyName, onDataChanged, onLogout }) {
  const [formOpen, setFormOpen] = useState(false);
  const [einladung, setEinladung] = useState(null);

  const createCompany = async (data) => {
    const res = await onCreateCompany(data);
    if (res?.error) return res.error;

    setFormOpen(false);
    /* Über diesem Admin-Konto steht niemand mehr: Kommt die E-Mail nicht an,
       wäre das Unternehmen ohne den Link nicht mehr zu betreten. */
    setEinladung({
      link: res.link,
      hinweis: res.benachrichtigt
        ? `Unternehmen angelegt. Die Einladung ist an ${data.adminEmail} unterwegs. Notiere den Link zur Sicherheit:`
        : "Unternehmen angelegt, aber es ging keine E-Mail raus. Gib diesen Link an das Admin-Konto weiter:",
    });
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
