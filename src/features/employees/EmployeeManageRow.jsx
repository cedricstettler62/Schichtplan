import { useState } from "react";
import Avatar from "../../components/Avatar.jsx";
import Badge from "../../components/Badge.jsx";
import Toggle from "../../components/Toggle.jsx";
import EmailChangeForm from "../../components/EmailChangeForm.jsx";
import DeleteAccountButton from "../../components/DeleteAccountButton.jsx";

export default function EmployeeManageRow({ account, qualifications, verifyAdmin, onUpdateEmail, onSetQualification, onDeleteAccount, onPromote }) {
  const [open, setOpen] = useState(false);
  const [confirmingPromote, setConfirmingPromote] = useState(false);

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)}>
        <Avatar name={account.name} role={account.role} small />
        <span className="sb-manage-name">{account.name}</span>
        <Badge tone="petrol">Mitarbeiter</Badge>
        <span className="sb-manage-email">{account.email}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-manage-row-body">
          <h4 className="sb-detail-label" style={{ marginBottom: 4 }}>E-Mail ändern (Bestätigung mit deinem Admin-Passwort)</h4>
          <EmailChangeForm verify={verifyAdmin} initialEmail={account.email} onSave={(email, pw) => onUpdateEmail(account.id, email, pw)} />

          <h4 className="sb-detail-label" style={{ marginTop: 14, marginBottom: 4 }}>Qualifikationen</h4>
          {qualifications.length === 0 && <p className="sb-empty">Noch keine Qualifikationen im System.</p>}
          {qualifications.map((q) => (
            <Toggle
              key={q.id}
              label={q.name}
              checked={account.qualifications.includes(q.id)}
              onChange={(val) => onSetQualification(account.id, q.id, val)}
            />
          ))}

          <div className="sb-manage-actions">
            {confirmingPromote ? (
              <span className="sb-confirm">
                <span>{account.name} zum Admin befördern?</span>
                <button type="button" className="sb-btn sb-btn-amber" onClick={() => { onPromote(account.id); setConfirmingPromote(false); }}>Ja, befördern</button>
                <button type="button" className="sb-link-btn" onClick={() => setConfirmingPromote(false)}>Abbrechen</button>
              </span>
            ) : (
              <button type="button" className="sb-btn sb-btn-amber" onClick={() => setConfirmingPromote(true)}>Zum Admin befördern</button>
            )}
            <DeleteAccountButton onConfirm={() => onDeleteAccount(account.id)} />
          </div>
        </div>
      )}
    </div>
  );
}
