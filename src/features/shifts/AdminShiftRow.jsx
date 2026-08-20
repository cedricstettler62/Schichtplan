import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";
import DateStub from "../../components/DateStub.jsx";
import EditShiftForm from "./EditShiftForm.jsx";
import { hasQualifications } from "#shared/assignment.js";

/*
 * Eine Schicht in der Admin-Ansicht. Aufgeklappt zeigt sie, wer eingeschrieben
 * und wer zugeteilt ist — bisher stand dort nur eine Zahl, und aus einer festen
 * Zuteilung kam niemand mehr heraus.
 */

/** Sagt vor dem Löschen, wen es trifft — sonst verschwindet still jemandes Schicht. */
function betroffene(shift, frage) {
  if (shift.assigned.length === 0) return frage;
  return shift.assigned.length === 1
    ? `${frage} Eine zugeteilte Person verliert sie.`
    : `${frage} ${shift.assigned.length} zugeteilte Personen verlieren sie.`;
}

function PersonList({ title, people, emptyText, helpRequests, assignmentTypes, onRemove }) {
  return (
    <div className="sb-stack">
      <span className="sb-detail-label">{title}</span>
      {people.length === 0 ? (
        <p className="sb-empty">{emptyText}</p>
      ) : (
        <div className="sb-person-list">
          {people.map((p) => (
            <div key={p.id} className="sb-person-row">
              <span className="sb-person-name">{p.name}</span>
              {/* "eingeteilt via Auslosung" bleibt der stille Regelfall — nur die
                  Ausnahme (direkt zugewiesen, ohne eigene Einschreibung) bekommt
                  eine eigene Markierung. */}
              {assignmentTypes?.[p.id] === "manual" && <Badge tone="amber">Direkt zugewiesen</Badge>}
              {helpRequests.includes(p.id) && <Badge tone="rust">sucht Ersatz</Badge>}
              <span className="sb-person-action">
                <ConfirmDelete
                  onConfirm={() => onRemove(p.id)}
                  label="Austragen"
                  confirmLabel="Ja, austragen"
                  question={`${p.name} von dieser Schicht austragen?`}
                  variant="button"
                  small
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default function AdminShiftRow({
  shift, qualNames, accounts, qualifications, seriesShifts, shifts, combinableSeries,
  onForceAssign, onDirectAssign, onRemoveEnrollment, onUpdateShift, onDeleteShift, onDeleteSeries,
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [pickedAccountId, setPickedAccountId] = useState("");
  const [assignError, setAssignError] = useState("");
  const full = shift.assigned.length >= shift.seats;

  const nameOf = (id) => accounts.find((a) => a.id === id)?.name || "Unbekannt";
  const assigned = shift.assigned.map((id) => ({ id, name: nameOf(id) }));
  const waiting = shift.enrolled
    .filter((id) => !shift.assigned.includes(id))
    .map((id) => ({ id, name: nameOf(id) }));

  /* Wer die Schicht überhaupt übernehmen könnte: dieselbe Qualifikationsprüfung
     wie beim Einschreiben, nur ohne dass eine Einschreibung vorausgesetzt wird.
     Der Server prüft das ohnehin nochmal — hier geht es nur um die Auswahl. */
  const zuweisbar = accounts.filter(
    (a) => !shift.assigned.includes(a.id) && hasQualifications(accounts, a.id, shift.qualificationIds)
  );

  const zuweisen = async () => {
    if (!pickedAccountId) return;
    const meldung = await onDirectAssign(shift.id, pickedAccountId);
    if (meldung) { setAssignError(meldung); return; }
    setAssignError("");
    setPickedAccountId("");
    setAssigning(false);
  };

  return (
    <div className="sb-ticket sb-ticket-expandable">
      <div className="sb-ticket-row">
        <DateStub iso={shift.date} />
        <div className="sb-ticket-body">
          <div className="sb-ticket-top">
            <span className="sb-ticket-name">{shift.name}</span>
            <Badge tone={full ? "petrol" : "amber"}>{full ? "Besetzt" : "Freie Plätze"}</Badge>
            {shift.helpRequests.length > 0 && <Badge tone="rust">Ersatz gesucht</Badge>}
          </div>
          <div className="sb-ticket-meta">
            <span className="sb-mono">{shift.startTime}–{shift.endTime}</span>
            <span>{qualNames || "ohne Qualifikation"}</span>
            <span>{shift.assigned.length} von {shift.seats} Plätzen besetzt</span>
            {waiting.length > 0 && <span>{waiting.length} auf der Warteliste</span>}
          </div>
        </div>
        {/* Nur zeigen, wenn es auch etwas zu verteilen gibt: ohne Warteliste
            hätte die Auslosung niemanden, aus dem sie wählen könnte. */}
        {!full && waiting.length > 0 && (
          <button
            type="button"
            className="sb-btn sb-btn-petrol sb-ticket-action"
            onClick={() => onForceAssign(shift.id)}
          >
            Jetzt zuteilen
          </button>
        )}
        <button
          type="button"
          className="sb-ticket-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Personen ausblenden" : "Personen anzeigen"}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>

      {open && (
        <div className="sb-ticket-detail">
          {shift.assignmentAttempted && !full && (
            <p className="sb-status">
              Die Auslosung für diese Schicht ist gelaufen, die Warteliste damit aufgelöst.
              Der freie Platz geht an die erste qualifizierte Person, die sich einschreibt oder übernimmt.
            </p>
          )}
          <PersonList
            title="Zugeteilt"
            people={assigned}
            emptyText="Noch niemand zugeteilt."
            helpRequests={shift.helpRequests}
            assignmentTypes={shift.assignmentTypes}
            onRemove={(id) => onRemoveEnrollment(shift.id, id)}
          />
          <PersonList
            title="Eingeschrieben, noch nicht zugeteilt"
            people={waiting}
            emptyText="Niemand wartet auf einen Platz."
            helpRequests={shift.helpRequests}
            onRemove={(id) => onRemoveEnrollment(shift.id, id)}
          />

          {!full && (
            <div className="sb-stack">
              {assigning ? (
                <div className="sb-inline-add">
                  <select
                    value={pickedAccountId}
                    onChange={(e) => setPickedAccountId(e.target.value)}
                    aria-label="Person auswählen"
                  >
                    <option value="">Person wählen …</option>
                    {zuweisbar.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button type="button" className="sb-btn sb-btn-ink" onClick={zuweisen} disabled={!pickedAccountId}>
                    Zuweisen
                  </button>
                  <button
                    type="button"
                    className="sb-btn sb-btn-quiet"
                    onClick={() => { setAssigning(false); setAssignError(""); setPickedAccountId(""); }}
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setAssigning(true)}>
                  Person direkt zuweisen
                </button>
              )}
              {assigning && zuweisbar.length === 0 && (
                <p className="sb-empty">Niemand mit passender Qualifikation ist noch frei für diese Schicht.</p>
              )}
              {assignError && <p className="sb-error">{assignError}</p>}
            </div>
          )}

          {editing ? (
            <EditShiftForm
              shift={shift}
              seriesShifts={seriesShifts}
              shifts={shifts}
              combinableSeries={combinableSeries}
              qualifications={qualifications}
              onSave={onUpdateShift}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="sb-manage-actions">
              <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setEditing(true)}>
                Bearbeiten
              </button>
            </div>
          )}

          <div className="sb-manage-actions">
            <ConfirmDelete
              onConfirm={() => onDeleteShift(shift.id)}
              label="Schicht löschen"
              question={betroffene(shift, "Diese Schicht löschen?")}
              variant="button"
              small
            />
            {shift.repeat !== "once" && (
              <ConfirmDelete
                onConfirm={() => onDeleteSeries(shift.id)}
                label="Serie ab hier löschen"
                confirmLabel="Ja, Serie löschen"
                question={`Diese und alle späteren Schichten der Serie „${shift.name}“ löschen? Vergangene bleiben erhalten.`}
                variant="button"
                small
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
