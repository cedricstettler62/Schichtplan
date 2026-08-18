import { useState } from "react";
import PasswordForm from "../../components/PasswordForm.jsx";
import Toggle from "../../components/Toggle.jsx";
import DataExportButton from "../../components/DataExportButton.jsx";
import CalendarSubscriptionCard from "../../components/CalendarSubscriptionCard.jsx";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";
import AppInstallCard from "../../components/AppInstallCard.jsx";
import SessionCard from "../../components/SessionCard.jsx";

export default function SettingsTab({
  settings, currentUser, istLetzterAdmin, verifySelf, onDemoteSelf,
  qualifications, onAddQualification, onDeleteQualification, onSetOwnQualification,
  onChangeAssignmentDay, onChangeOwnPassword, onDeleteOwnAccount, onLogout,
}) {
  const [value, setValue] = useState(settings.assignmentDay);
  const [saved, setSaved] = useState(false);
  const [newQual, setNewQual] = useState("");
  const [qualError, setQualError] = useState("");
  const [rolleError, setRolleError] = useState("");

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
    // Vorher wurde das Feld wortlos geleert — auf Knopfdruck passierte scheinbar nichts.
    if (qualifications.some((q) => q.name.toLowerCase() === trimmed.toLowerCase())) {
      setQualError(`„${trimmed}“ gibt es schon.`);
      return;
    }
    setQualError("");
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

      <div className="sb-card">
        <h3 className="sb-subheading">Meine Qualifikationen</h3>
        {/* Die eigene Ausnahme von „Qualifikationen vergibt die Administration“:
            Wer selbst eine Schicht übernehmen will, käme sonst an keine — die
            Mitarbeitendenliste führt nur Mitarbeitendenkonten. */}
        <p className="sb-tab-intro">
          Bestimmt, welche Schichten du selbst übernehmen kannst. Für alle anderen vergibst du
          Qualifikationen unter <em>Mitarbeitende</em>.
        </p>
        {qualifications.length === 0 ? (
          <p className="sb-empty">Lege zuerst oben eine Qualifikation an.</p>
        ) : (
          <div className="sb-toggle-list">
            {qualifications.map((q) => (
              <Toggle
                key={q.id}
                label={q.name}
                checked={currentUser.qualifications.includes(q.id)}
                onChange={(val) => onSetOwnQualification(q.id, val)}
              />
            ))}
          </div>
        )}
      </div>

      <PasswordForm verify={verifySelf} onSubmit={onChangeOwnPassword} />

      <div className="sb-card">
        <h3 className="sb-subheading">Meine Daten</h3>
        <DataExportButton accountId={currentUser.id} />
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">Adminrechte abgeben</h3>
        {/* Nur die eigenen: Ein Admin stuft keinen anderen herunter, das wäre
            dasselbe Entmachten wie ein fremdes Passwort zu setzen. */}
        {istLetzterAdmin ? (
          <p className="sb-empty">
            Du bist die einzige Administration – befördere zuerst jemanden, der übernimmt.
          </p>
        ) : (
          <>
            <p className="sb-tab-intro">
              Dein Konto bleibt bestehen und wird zu einem Mitarbeitendenkonto. Zurückholen kann
              dich danach nur eine andere Administration.
            </p>
            <div className="sb-form-actions">
              <ConfirmDelete
                onConfirm={async () => setRolleError((await onDemoteSelf()) || "")}
                label="Adminrechte abgeben"
                confirmLabel="Ja, abgeben"
                question="Adminrechte wirklich abgeben? Mitarbeitende und Einstellungen sind danach für dich zu."
                variant="button"
              />
            </div>
            {rolleError && <p className="sb-error">{rolleError}</p>}
          </>
        )}
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">Konto löschen</h3>
        {!istLetzterAdmin ? (
          <>
            <p className="sb-tab-intro">Löscht dein eigenes Admin-Konto endgültig. Du wirst dabei abgemeldet.</p>
            <div className="sb-form-actions">
              <ConfirmDelete
                onConfirm={onDeleteOwnAccount}
                label="Mein Konto löschen"
                question="Dein Admin-Konto wirklich löschen? Das lässt sich nicht rückgängig machen."
                variant="button"
              />
            </div>
          </>
        ) : (
          <p className="sb-empty">
            Du bist die einzige Administration – dieses Konto löscht nur die Verwaltung, die dabei
            eine Nachfolge bestimmt.
          </p>
        )}
      </div>

      <CalendarSubscriptionCard accountId={currentUser.id} />
      <AppInstallCard />
      <SessionCard onLogout={onLogout} />
    </div>
  );
}
