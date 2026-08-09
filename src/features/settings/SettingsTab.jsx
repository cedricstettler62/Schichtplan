import { useState } from "react";
import EmailChangeForm from "../../components/EmailChangeForm.jsx";
import PasswordChangeForm from "../../components/PasswordChangeForm.jsx";
import DeleteAccountButton from "../../components/DeleteAccountButton.jsx";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";

export default function SettingsTab({
  settings, currentUser, canDeleteSelf, verifySelf,
  qualifications, onAddQualification, onDeleteQualification,
  onChangeAssignmentDay, onUpdateOwnEmail, onChangeOwnPassword, onDeleteOwnAccount,
}) {
  const [value, setValue] = useState(settings.assignmentDay);
  const [saved, setSaved] = useState(false);
  const [newQual, setNewQual] = useState("");

  const save = async () => {
    const n = Math.min(28, Math.max(1, Number(value) || 1));
    await onChangeAssignmentDay(n);
    setValue(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addQual = async () => {
    const trimmed = newQual.trim();
    if (!trimmed) return;
    if (qualifications.some((q) => q.name.toLowerCase() === trimmed.toLowerCase())) { setNewQual(""); return; }
    await onAddQualification(trimmed);
    setNewQual("");
  };

  return (
    <div className="sb-tab">
      <div className="sb-card sb-form">
        <h3 className="sb-subheading">Zuteilungstag</h3>
        <p className="sb-tab-intro">An diesem Tag jedes Monats werden alle Schichten des Folgemonats automatisch zugeteilt, sobald jemand eingeschrieben ist.</p>
        <div className="sb-inline-add">
          <input type="number" min="1" max="28" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} style={{ width: "90px" }} />
          <button type="button" className="sb-btn sb-btn-ink" onClick={save}>Speichern</button>
          {saved && <span className="sb-saved-note">Gespeichert.</span>}
        </div>
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">Qualifikationen</h3>
        <p className="sb-tab-intro">Gelten nur für dieses Unternehmen. Neue anlegen oder nicht mehr gebrauchte löschen.</p>
        <div className="sb-chip-row">
          {qualifications.length === 0 && <p className="sb-empty">Noch keine Qualifikationen vorhanden.</p>}
          {qualifications.map((q) => (
            <span key={q.id} className="sb-qual-manage-chip">
              {q.name}
              <ConfirmDelete onConfirm={() => onDeleteQualification(q.id)} />
            </span>
          ))}
        </div>
        <div className="sb-inline-add">
          <input value={newQual} onChange={(e) => setNewQual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQual()} placeholder="Neue Qualifikation" />
          <button type="button" className="sb-btn sb-btn-ink" onClick={addQual}>Hinzufügen</button>
        </div>
      </div>

      <div className="sb-card sb-form">
        <h3 className="sb-subheading">Mein Konto – E-Mail ändern</h3>
        <EmailChangeForm verify={verifySelf} initialEmail={currentUser.email} onSave={onUpdateOwnEmail} />
      </div>

      <PasswordChangeForm verify={verifySelf} onChangePassword={onChangeOwnPassword} />

      <div className="sb-card">
        <h3 className="sb-subheading">Konto löschen</h3>
        {canDeleteSelf ? (
          <>
            <p className="sb-tab-intro">Dies löscht dein eigenes Admin-Konto unwiderruflich.</p>
            <DeleteAccountButton onConfirm={onDeleteOwnAccount} />
          </>
        ) : (
          <p className="sb-empty">Das letzte Admin-Konto kann nicht gelöscht werden.</p>
        )}
      </div>
    </div>
  );
}
