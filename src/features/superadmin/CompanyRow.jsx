import { useState } from "react";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";

export default function CompanyRow({ company, onDelete, onUpdateName }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [saved, setSaved] = useState(false);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onUpdateName(company.id, trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)}>
        <span className="sb-manage-name">{company.name}</span>
        <span className="sb-manage-email sb-mono">{company.code}</span>
        <span className="sb-manage-email">
          {company.adminCount} Admin{company.adminCount === 1 ? "" : "s"} · {company.employeeCount} Mitarbeitende
        </span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-manage-row-body">
          <div className="sb-inline-add">
            <label className="sb-field" style={{ flex: 1 }}>
              <span>Name des Unternehmens</span>
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
            </label>
            <button type="button" className="sb-btn sb-btn-ink" onClick={saveName}>Speichern</button>
            {saved && <span className="sb-saved-note">Gespeichert.</span>}
          </div>
          <div className="sb-manage-actions">
            <ConfirmDelete onConfirm={() => onDelete(company.id)} label="Unternehmen löschen" />
          </div>
        </div>
      )}
    </div>
  );
}
