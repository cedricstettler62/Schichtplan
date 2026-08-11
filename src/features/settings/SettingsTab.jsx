import { useState } from "react";
import PasswordChangeForm from "../../components/PasswordChangeForm.jsx";
import DeleteAccountButton from "../../components/DeleteAccountButton.jsx";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";

export default function SettingsTab({
  settings, canDeleteSelf, verifySelf,
  qualifications, onAddQualification, onDeleteQualification,
  onChangeAssignmentDay, onChangeOwnPassword, onDeleteOwnAccount,
}) {
  const [value, setValue] = useState(settings.assignmentDay);
  const [saved, setSaved] = useState(false);
  const [newQual, setNewQual] = useState("");
  const [qualError, setQualError] = useState("");

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
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Einstellungen</h2>
          <p className="sb-tab-intro">Regeln für dieses Unternehmen und dein eigenes Admin-Konto.</p>
        </div>
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">Zuteilungstag</h3>
        <p className="sb-tab-intro">An diesem Tag jedes Monats werden alle Schichten des Folgemonats automatisch zugeteilt, sobald jemand eingeschrieben ist.</p>
        <div className="sb-inline-add">
          <label className="sb-field sb-field-compact">
            <span>Tag im Monat (1–28)</span>
            <input type="number" min="1" max="28" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          </label>
          <button type="button" className="sb-btn sb-btn-ink" onClick={save}>Speichern</button>
          {saved && <span className="sb-saved-note">Gespeichert.</span>}
        </div>
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">Qualifikationen</h3>
        <p className="sb-tab-intro">Gelten nur für dieses Unternehmen. Eine Schicht kann nur übernehmen, wer die passende Qualifikation hat.</p>
        <div className="sb-chip-row">
          {qualifications.length === 0 && <p className="sb-empty">Noch keine Qualifikationen angelegt.</p>}
          {qualifications.map((q) => (
            <span key={q.id} className="sb-qual-manage-chip">
              {q.name}
              <ConfirmDelete
                onConfirm={async () => setQualError((await onDeleteQualification(q.id)) || "")}
                label={`Qualifikation „${q.name}“ löschen`}
                question={`„${q.name}“ löschen?`}
              />
            </span>
          ))}
        </div>
        {qualError && <p className="sb-error">{qualError}</p>}
        <div className="sb-inline-add">
          <input value={newQual} onChange={(e) => setNewQual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQual()} placeholder="z. B. Kassenschulung" />
          <button type="button" className="sb-btn sb-btn-ink" onClick={addQual}>Hinzufügen</button>
        </div>
      </div>

      <PasswordChangeForm verify={verifySelf} onChangePassword={onChangeOwnPassword} />

      <div className="sb-card">
        <h3 className="sb-subheading">Konto löschen</h3>
        {canDeleteSelf ? (
          <>
            <p className="sb-tab-intro">Löscht dein eigenes Admin-Konto endgültig. Du wirst dabei abgemeldet.</p>
            <div className="sb-form-actions">
              <DeleteAccountButton
                onConfirm={onDeleteOwnAccount}
                label="Mein Konto löschen"
                question="Dein Admin-Konto wirklich löschen? Das lässt sich nicht rückgängig machen."
              />
            </div>
          </>
        ) : (
          <p className="sb-empty">Du bist der einzige Admin – das letzte Admin-Konto kann nicht gelöscht werden.</p>
        )}
      </div>
    </div>
  );
}
