import { useEffect, useState } from "react";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";
import LogbookEntryRow from "../logbook/LogbookEntryRow.jsx";

function fmtDatum(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" });
}

/**
 * Ein archiviertes Unternehmen: der Zugang ist gesperrt, seine Daten stehen
 * aber noch — read-only Adminliste/Mitarbeitendenliste und Logbuch, dazu
 * Wiederherstellen oder die endgültige, unwiderrufliche Löschung.
 */
export default function ArchivedCompanyRow({ company, onRestore, onPurge, onLoadAdmins, onLoadEmployees, onLoadLogbook }) {
  const [open, setOpen] = useState(false);
  const [admins, setAdmins] = useState(null); // null = noch nicht geladen
  const [employees, setEmployees] = useState(null);
  const [logbook, setLogbook] = useState(null); // null = noch nicht geladen

  useEffect(() => {
    if (!open || admins !== null) return;
    let abgebrochen = false;
    Promise.all([onLoadAdmins(company.id), onLoadEmployees(company.id)]).then(([adminListe, leute]) => {
      if (abgebrochen) return;
      setAdmins(adminListe);
      setEmployees(leute);
    });
    return () => { abgebrochen = true; };
  }, [open, admins, company.id, onLoadAdmins, onLoadEmployees]);

  const logbuchLaden = async () => {
    if (logbook !== null) { setLogbook(null); return; }
    setLogbook(await onLoadLogbook(company.id));
  };

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="sb-manage-name">{company.name}</span>
        <span className="sb-manage-meta sb-mono">{company.code}</span>
        <span className="sb-manage-summary">archiviert am {fmtDatum(company.archivedAt)}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-manage-row-body">
          <div className="sb-manage-section">
            <span className="sb-detail-label">Konten</span>
            {admins === null ? (
              <p className="sb-status">Wird geladen …</p>
            ) : (
              <p className="sb-status">
                {admins.length} Admin{admins.length === 1 ? "" : "s"}
                {admins.length > 0 && `: ${admins.map((a) => a.name).join(", ")}`}
                {" · "}
                {employees.length} Mitarbeitende{employees.length > 0 && `: ${employees.map((a) => a.name).join(", ")}`}
              </p>
            )}
          </div>

          <div className="sb-manage-section">
            <span className="sb-detail-label">Logbuch</span>
            <p className="sb-status">
              Anlegen, Ändern, Zu-/Umteilungen und Hilfegesuche dieses Unternehmens.
            </p>
            <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={logbuchLaden}>
              {logbook !== null ? "Logbuch ausblenden" : "Logbuch laden"}
            </button>
            {logbook !== null && (
              logbook.length === 0 ? (
                <p className="sb-empty">Keine Einträge.</p>
              ) : (
                <div className="sb-log-list">
                  {logbook.map((e) => <LogbookEntryRow key={e.id} entry={e} />)}
                </div>
              )
            )}
          </div>

          <div className="sb-manage-actions">
            <button type="button" className="sb-btn sb-btn-sm sb-btn-quiet" onClick={() => onRestore(company.id)}>
              Wiederherstellen
            </button>
            <ConfirmDelete
              onConfirm={() => onPurge(company.id)}
              label="Endgültig löschen"
              confirmLabel="Ja, endgültig löschen"
              question={`„${company.name}“ endgültig löschen — inklusive Logbuch, Schichten und aller Konten? Das lässt sich nicht rückgängig machen.`}
              variant="button"
              small
            />
          </div>
        </div>
      )}
    </div>
  );
}
