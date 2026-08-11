import { useState } from "react";
import Avatar from "../../components/Avatar.jsx";
import Badge from "../../components/Badge.jsx";
import Toggle from "../../components/Toggle.jsx";
import PasswordResetForm from "../../components/PasswordResetForm.jsx";
import DeleteAccountButton from "../../components/DeleteAccountButton.jsx";
import DataExportButton from "../../components/DataExportButton.jsx";

export default function EmployeeManageRow({ account, qualifications, verifyAdmin, onResetPassword, onSetQualification, onDeleteAccount, onPromote }) {
  const [open, setOpen] = useState(false);
  const [confirmingPromote, setConfirmingPromote] = useState(false);

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)}>
        <Avatar name={account.name} role={account.role} small />
        <span className="sb-manage-name">{account.name}</span>
        <Badge tone="petrol">Mitarbeitende</Badge>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-manage-row-body">
          <div className="sb-manage-section">
            <span className="sb-detail-label">Passwort zurücksetzen</span>
            <p className="sb-status">Für den Fall, dass {account.name.split(" ")[0]} nicht mehr hineinkommt.</p>
            <PasswordResetForm
              verify={verifyAdmin}
              onReset={(neu, adminPw) => onResetPassword(account.id, neu, adminPw)}
            />
          </div>

          <div className="sb-manage-section">
            <span className="sb-detail-label">Qualifikationen</span>
            {qualifications.length === 0 ? (
              <p className="sb-empty">Noch keine Qualifikationen angelegt – das geht unter „Einstellungen“.</p>
            ) : (
              <div className="sb-toggle-list">
                {qualifications.map((q) => (
                  <Toggle
                    key={q.id}
                    label={q.name}
                    checked={account.qualifications.includes(q.id)}
                    onChange={(val) => onSetQualification(account.id, q.id, val)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="sb-manage-section">
            <span className="sb-detail-label">Auskunft über gespeicherte Daten</span>
            <DataExportButton accountId={account.id} wessen={`${account.name.split(" ")[0]}`} />
          </div>

          <div className="sb-manage-actions">
            {confirmingPromote ? (
              <span className="sb-confirm">
                <span>{account.name} zum Admin befördern? Admins können alle Schichten und Konten verwalten.</span>
                <button type="button" className="sb-btn sb-btn-amber sb-btn-sm" onClick={() => { onPromote(account.id); setConfirmingPromote(false); }}>Ja, befördern</button>
                <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setConfirmingPromote(false)}>Abbrechen</button>
              </span>
            ) : (
              <>
                <button type="button" className="sb-btn sb-btn-amber" onClick={() => setConfirmingPromote(true)}>Zum Admin befördern</button>
                <DeleteAccountButton
                  onConfirm={() => onDeleteAccount(account.id)}
                  question={`Konto von ${account.name} wirklich löschen? Das lässt sich nicht rückgängig machen.`}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
