import { useEffect, useState } from "react";
import Avatar from "../../components/Avatar.jsx";
import Badge from "../../components/Badge.jsx";
import PasswordForm from "../../components/PasswordForm.jsx";
import DataExportButton from "../../components/DataExportButton.jsx";
import CalendarSubscriptionCard from "../../components/CalendarSubscriptionCard.jsx";
import EmailCard from "../../components/EmailCard.jsx";
import Karte from "../../components/Karte.jsx";
import AppInstallCard from "../../components/AppInstallCard.jsx";
import SessionCard from "../../components/SessionCard.jsx";
import LogbookEntryRow from "../logbook/LogbookEntryRow.jsx";
import { useKurzeMeldung } from "../../hooks.js";
import { fmtDate } from "#shared/dates.js";

const STATUS_LABEL = { pending: "Angefragt", approved: "Genehmigt", declined: "Abgelehnt" };
const STATUS_TONE = { pending: "ink", approved: "petrol", declined: "rust" };

/** Anfrage auf Einsicht ins Logbuch einer eigenen, vergangenen Schicht. */
function LogbookAccessCard({ myRequests, onLoadEligibleShifts, onRequestAccess, onLoadShiftLogbook }) {
  const [shifts, setShifts] = useState(null); // null = wird geladen
  const [shiftId, setShiftId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sent, zeigeGesendet] = useKurzeMeldung(2500);
  const [openEntries, setOpenEntries] = useState({}); // requestId -> Einträge | null (lädt noch)

  /* Aufgeklappt ist, wofür ein Schlüssel dasteht — auch mit dem Wert null,
     solange die Einträge noch unterwegs sind. */
  const istOffen = (id) => Object.hasOwn(openEntries, id);

  useEffect(() => {
    let abgebrochen = false;
    onLoadEligibleShifts().then((rows) => { if (!abgebrochen) setShifts(rows); });
    return () => { abgebrochen = true; };
  }, [onLoadEligibleShifts]);

  const submit = async () => {
    if (!shiftId) { setError("Bitte eine Schicht auswählen."); return; }
    const meldung = await onRequestAccess(shiftId, note.trim());
    if (meldung) { setError(meldung); return; }
    setError("");
    setShiftId("");
    setNote("");
    zeigeGesendet();
  };

  const toggleEntries = async (request) => {
    if (request.status !== "approved") return;
    if (istOffen(request.id)) {
      setOpenEntries((o) => { const n = { ...o }; delete n[request.id]; return n; });
      return;
    }
    setOpenEntries((o) => ({ ...o, [request.id]: null }));
    const rows = await onLoadShiftLogbook(request.shiftId);
    setOpenEntries((o) => ({ ...o, [request.id]: rows }));
  };

  return (
    <Karte titel="Logbuch-Einsicht anfragen" intro="Für Schichten, für die du in der Vergangenheit eingetragen warst — egal ob du sie am Ende übernommen hast —, kannst du die Administration um Einsicht ins Logbuch bitten.">
      {shifts === null ? (
        <p className="sb-status">Schichten werden geladen …</p>
      ) : shifts.length === 0 ? (
        <p className="sb-empty">Keine vergangene Schicht gefunden, für die eine Anfrage möglich wäre.</p>
      ) : (
        <div className="sb-form-grid">
          <label className="sb-field">
            <span>Schicht</span>
            <select value={shiftId} onChange={(e) => { setShiftId(e.target.value); setError(""); }}>
              <option value="">Bitte wählen</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {fmtDate(s.date)}</option>
              ))}
            </select>
          </label>
          <label className="sb-field">
            <span>Notiz (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Grund der Anfrage" />
          </label>
          <div className="sb-field sb-field-btn">
            <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Anfragen</button>
          </div>
        </div>
      )}
      {error && <p className="sb-error">{error}</p>}
      {sent && <p className="sb-saved-note">Anfrage gesendet.</p>}

      {myRequests.length > 0 && (
        <div className="sb-manage-list">
          {myRequests.map((r) => (
            <div key={r.id} className="sb-manage-row">
              <button
                type="button"
                className="sb-manage-row-head"
                onClick={() => toggleEntries(r)}
                aria-expanded={istOffen(r.id)}
              >
                <span className="sb-manage-name">{r.shiftLabel}</span>
                <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </button>
              {istOffen(r.id) && (
                <div className="sb-manage-row-body">
                  {openEntries[r.id] === null ? (
                    <p className="sb-status">Wird geladen …</p>
                  ) : openEntries[r.id].length === 0 ? (
                    <p className="sb-empty">Keine Einträge.</p>
                  ) : (
                    <div className="sb-log-list">
                      {openEntries[r.id].map((e) => <LogbookEntryRow key={e.id} entry={e} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Karte>
  );
}

export default function AccountTab({
  currentUser, qualifications, verifySelf, onChangePassword, onChangeEmail, onLogout,
  logbookAccessRequests, onLoadEligibleShifts, onRequestLogbookAccess, onLoadShiftLogbook,
}) {
  const meine = qualifications.filter((q) => currentUser.qualifications.includes(q.id));
  return (
    <div className="sb-tab">
      <div className="sb-card">
        <div className="sb-account-head">
          <Avatar name={currentUser.name} role={currentUser.role} />
          <div className="sb-account-name-lg">{currentUser.name}</div>
        </div>
        <h3 className="sb-subheading">Meine Qualifikationen</h3>
        {/* Nur zum Nachlesen: Vergeben werden sie von der Administration —
            sonst wäre eine Qualifikation eine Selbstauskunft, während sie an
            jeder anderen Stelle als geprüfte Voraussetzung auftritt. */}
        <p className="sb-tab-intro">
          Bestimmt, für welche Schichten du dich einschreiben kannst. Vergeben werden Qualifikationen
          von der Administration – wenn etwas fehlt, wende dich an sie.
        </p>
        {meine.length === 0 ? (
          <p className="sb-empty">Dir ist noch keine Qualifikation zugeordnet.</p>
        ) : (
          <div className="sb-chip-row">
            {meine.map((q) => <span key={q.id} className="sb-qual-chip">{q.name}</span>)}
          </div>
        )}
      </div>

      <LogbookAccessCard
        myRequests={(logbookAccessRequests || []).filter((r) => r.accountId === currentUser.id)}
        onLoadEligibleShifts={onLoadEligibleShifts}
        onRequestAccess={onRequestLogbookAccess}
        onLoadShiftLogbook={onLoadShiftLogbook}
      />

      <PasswordForm verify={verifySelf} onSubmit={onChangePassword} />

      <EmailCard
        accountId={currentUser.id}
        onChangeEmail={onChangeEmail}
        required
        hinweis="Pflicht — dorthin geht die Kalenderdatei (ICS), sobald dir eine Schicht zugeteilt wird."
      />

      <Karte titel="Meine Daten">
        <DataExportButton accountId={currentUser.id} />
      </Karte>

      <CalendarSubscriptionCard accountId={currentUser.id} />
      <AppInstallCard />
      <SessionCard onLogout={onLogout} />
    </div>
  );
}
