import { useState } from "react";
import { useKurzeMeldung } from "../../hooks.js";
import { LAST_DAY_OF_MONTH } from "#shared/assignment.js";
import { FAIRNESS_WINDOW_KEYS, FAIRNESS_WINDOW_LABELS } from "#shared/labels.js";
import PasswordForm from "../../components/PasswordForm.jsx";
import { QualToggles } from "../../components/Toggle.jsx";
import DataExportButton from "../../components/DataExportButton.jsx";
import CalendarSubscriptionCard from "../../components/CalendarSubscriptionCard.jsx";
import EmailCard from "../../components/EmailCard.jsx";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";
import Karte from "../../components/Karte.jsx";
import AppInstallCard from "../../components/AppInstallCard.jsx";
import SessionCard from "../../components/SessionCard.jsx";
import TabHead from "../../components/TabHead.jsx";

export default function SettingsTab({
  settings, currentUser, istLetzterAdmin, verifySelf, onDemoteSelf,
  qualifications, onAddQualification, onDeleteQualification, onSetOwnQualification,
  onChangeAssignmentDay, onChangeFairnessSettings, onChangeOwnPassword, onChangeOwnEmail, onDeleteOwnAccount, onLogout,
}) {
  /* Der letzte Tag des Monats steht als 31 in den Einstellungen (siehe
     shared/assignment.js). Im Zahlenfeld hat er nichts verloren — es zeigt
     dann den 28. als höchsten Tag, den es in jedem Monat gibt, damit nach dem
     Abwählen des Kästchens ein gültiger Tag dasteht. */
  const [value, setValue] = useState(Math.min(settings.assignmentDay, 28));
  const [letzterTag, setLetzterTag] = useState(settings.assignmentDay >= LAST_DAY_OF_MONTH);
  const [newQual, setNewQual] = useState("");
  const [qualError, setQualError] = useState("");
  const [rolleError, setRolleError] = useState("");
  const [fairnessWindow, setFairnessWindow] = useState(settings.fairnessWindow);
  const [fairnessThreshold, setFairnessThreshold] = useState(settings.fairnessThresholdShifts);
  const [saved, zeigeGespeichert] = useKurzeMeldung();
  const [fairnessSaved, zeigeFairnessGespeichert] = useKurzeMeldung();

  const save = async () => {
    const n = Math.min(28, Math.max(1, Number(value) || 1));
    await onChangeAssignmentDay(letzterTag ? LAST_DAY_OF_MONTH : n);
    setValue(n);
    zeigeGespeichert();
  };

  const saveFairness = async () => {
    const n = Math.min(50, Math.max(0, Number(fairnessThreshold) || 0));
    await onChangeFairnessSettings(fairnessWindow, n);
    setFairnessThreshold(n);
    zeigeFairnessGespeichert();
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
      <TabHead titel="Einstellungen" intro="Regeln für dieses Unternehmen und dein eigenes Admin-Konto." />

      <Karte titel="Zuteilungstag" intro="An diesem Tag jedes Monats werden alle Schichten des Folgemonats automatisch zugeteilt, sobald jemand eingeschrieben ist.">
        <div className="sb-stack">
          <label className="sb-field sb-field-compact">
            <span>Tag im Monat (1–28)</span>
            <input
              type="number" min="1" max="28" value={value} disabled={letzterTag}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </label>
          {/* Der 29., 30. und 31. fehlen im Feld, weil es sie nicht in jedem
              Monat gibt — wer bis zum Monatsende warten will, nimmt das
              Kästchen. */}
          <label className="sb-check-row">
            <input type="checkbox" checked={letzterTag} onChange={(e) => setLetzterTag(e.target.checked)} />
            <span>Stattdessen am letzten Tag des Monats</span>
          </label>
          <p className="sb-field-hint">Je nach Monat der 28., 29., 30. oder 31.</p>
          <div className="sb-inline-add">
            <button type="button" className="sb-btn sb-btn-ink" onClick={save}>Speichern</button>
            {saved && <span className="sb-saved-note">Gespeichert.</span>}
          </div>
        </div>
      </Karte>

      <Karte
        titel="Stundenausgleich bei der Auslosung"
        intro="Bei mehreren qualifizierten Eingeschriebenen bekommt eher, wer in diesem Zeitfenster bisher weniger zugeteilte Schichten hatte — eine gewichtete Auslosung, kein starres Ranking."
      >
        <div className="sb-inline-add">
          <label className="sb-field sb-field-compact">
            <span>Zeitfenster</span>
            <select value={fairnessWindow} onChange={(e) => setFairnessWindow(e.target.value)}>
              {FAIRNESS_WINDOW_KEYS.map((key) => (
                <option key={key} value={key}>{FAIRNESS_WINDOW_LABELS[key]}</option>
              ))}
            </select>
          </label>
          <label className="sb-field sb-field-compact">
            <span>Schichten-Unterschied, ab dem gewichtet wird</span>
            <input
              type="number" min="0" max="50" value={fairnessThreshold}
              onChange={(e) => setFairnessThreshold(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveFairness()}
            />
          </label>
          <button type="button" className="sb-btn sb-btn-ink" onClick={saveFairness}>Speichern</button>
          {fairnessSaved && <span className="sb-saved-note">Gespeichert.</span>}
        </div>
      </Karte>

      <Karte titel="Qualifikationen" intro="Gelten nur für dieses Unternehmen. Eine Schicht kann nur übernehmen, wer die passende Qualifikation hat.">
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
      </Karte>

      {/* Die eigene Ausnahme von „Qualifikationen vergibt die Administration“:
          Wer selbst eine Schicht übernehmen will, käme sonst an keine — die
          Mitarbeitendenliste führt nur Mitarbeitendenkonten. */}
      <Karte titel="Meine Qualifikationen" intro={<>Bestimmt, welche Schichten du selbst übernehmen kannst. Für alle anderen vergibst du Qualifikationen unter <em>Mitarbeitende</em>.</>}>
        <QualToggles
          qualifications={qualifications}
          gewaehlt={currentUser.qualifications}
          onSet={onSetOwnQualification}
          leerText="Lege zuerst oben eine Qualifikation an."
        />
      </Karte>

      <PasswordForm verify={verifySelf} onSubmit={onChangeOwnPassword} />

      <EmailCard
        accountId={currentUser.id}
        onChangeEmail={onChangeOwnEmail}
        required
        hinweis="Pflicht — damit erreicht dich eine Mail, sobald sich jemand neu anmeldet und auf Bestätigung wartet."
      />

      <Karte titel="Meine Daten">
        <DataExportButton accountId={currentUser.id} />
      </Karte>

      {/* Nur die eigenen: Ein Admin stuft keinen anderen herunter, das wäre
          dasselbe Entmachten wie ein fremdes Passwort zu setzen. */}
      <Karte titel="Adminrechte abgeben">
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
      </Karte>

      <Karte titel="Konto löschen">
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
      </Karte>

      <CalendarSubscriptionCard accountId={currentUser.id} />
      <AppInstallCard />
      <SessionCard onLogout={onLogout} />
    </div>
  );
}
