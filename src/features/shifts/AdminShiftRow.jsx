import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";
import DateStub from "../../components/DateStub.jsx";
import EditShiftForm from "./EditShiftForm.jsx";

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

function PersonList({ title, people, emptyText, helpRequests, onRemove }) {
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
  shift, qualName, accounts, qualifications, seriesShifts, shifts, combinableSeries,
  onForceAssign, onRemoveEnrollment, onUpdateShift, onDeleteShift, onDeleteSeries,
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const full = shift.assigned.length >= shift.seats;

  const nameOf = (id) => accounts.find((a) => a.id === id)?.name || "Unbekannt";
  const assigned = shift.assigned.map((id) => ({ id, name: nameOf(id) }));
  const waiting = shift.enrolled
    .filter((id) => !shift.assigned.includes(id))
    .map((id) => ({ id, name: nameOf(id) }));

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
            <span>{qualName || "ohne Qualifikation"}</span>
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
            onRemove={(id) => onRemoveEnrollment(shift.id, id)}
          />
          <PersonList
            title="Eingeschrieben, noch nicht zugeteilt"
            people={waiting}
            emptyText="Niemand wartet auf einen Platz."
            helpRequests={shift.helpRequests}
            onRemove={(id) => onRemoveEnrollment(shift.id, id)}
          />

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
              confirmLabel="Ja, löschen"
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
