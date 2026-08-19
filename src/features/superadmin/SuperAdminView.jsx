import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import ArchivedCompanyRow from "./ArchivedCompanyRow.jsx";
import CompanyRow from "./CompanyRow.jsx";
import NewCompanyForm from "./NewCompanyForm.jsx";
import SystemPanel from "./SystemPanel.jsx";

/** `companies` sind hier Kurzfassungen: { id, code, name, adminCount, employeeCount }. */
export default function SuperAdminView({
  companies, archivedCompanies, superAdminName, onCreateCompany,
  onArchiveCompany, onRestoreCompany, onPurgeCompany, onPauseCompany, onUnpauseCompany,
  onUpdateCompanyName, onLoadAdmins, onLoadEmployees, onResetAdminPassword, onDeleteAdmin, onLoadLogbook,
  onDataChanged, onLogout,
}) {
  const [tab, setTab] = useState("unternehmen");
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
        <nav className="sb-tabs">
          <button
            type="button"
            className={`sb-tab-btn ${tab === "unternehmen" ? "sb-tab-btn-active" : ""}`}
            onClick={() => setTab("unternehmen")}
          >
            Unternehmen
          </button>
          <button
            type="button"
            className={`sb-tab-btn ${tab === "archiviert" ? "sb-tab-btn-active" : ""}`}
            onClick={() => setTab("archiviert")}
          >
            Archiviert{archivedCompanies?.length > 0 ? ` (${archivedCompanies.length})` : ""}
          </button>
        </nav>
      </header>
      <main>
        {tab === "unternehmen" ? (
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
                    onArchive={onArchiveCompany}
                    onPause={onPauseCompany}
                    onUnpause={onUnpauseCompany}
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
        ) : (
          <div className="sb-tab">
            <div className="sb-tab-head">
              <div className="sb-tab-head-text">
                <h2 className="sb-tab-head-title">Archivierte Unternehmen</h2>
                <p className="sb-tab-intro">
                  Der Zugang ist gesperrt, ihre Daten bleiben aber erhalten — Logbuch und andere
                  aufbewahrungspflichtige Angaben lassen sich hier weiter einsehen.
                </p>
              </div>
            </div>

            <div className="sb-card">
              <div className="sb-manage-list">
                {(!archivedCompanies || archivedCompanies.length === 0) && (
                  <p className="sb-empty">Kein archiviertes Unternehmen.</p>
                )}
                {archivedCompanies?.map((c) => (
                  <ArchivedCompanyRow
                    key={c.id}
                    company={c}
                    onRestore={onRestoreCompany}
                    onPurge={onPurgeCompany}
                    onLoadAdmins={onLoadAdmins}
                    onLoadEmployees={onLoadEmployees}
                    onLoadLogbook={onLoadLogbook}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
