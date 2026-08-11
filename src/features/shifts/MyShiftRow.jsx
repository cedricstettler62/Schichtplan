import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import DateStub from "../../components/DateStub.jsx";
import { assignmentDateOf } from "#shared/assignment.js";
import { fmtDate } from "#shared/dates.js";

/*
 * Dieselbe Zeile für beide Listen: `onAskForHelp` für eine feste Zuteilung,
 * `onWithdraw` für eine Einschreibung, über die noch nicht entschieden ist.
 */
export default function MyShiftRow({
  shift, qualifications, currentUser, assignmentDay, onAskForHelp, onWithdraw,
}) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const wartend = !!onWithdraw;
  const askedForHelp = shift.helpRequests.includes(currentUser.id);
  const freiePlaetze = shift.seats - shift.assigned.length;

  return (
    <div className="sb-ticket sb-ticket-expandable">
      <button type="button" className="sb-ticket-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <DateStub iso={shift.date} />
        <div className="sb-ticket-body">
          <div className="sb-ticket-top">
            <span className="sb-ticket-name">{shift.name}</span>
            {wartend && <Badge tone="ink">Wartet auf Zuteilung</Badge>}
            {askedForHelp && <Badge tone="amber">Hilfe gesucht</Badge>}
          </div>
          <div className="sb-ticket-meta">
            <span className="sb-mono">{shift.startTime}–{shift.endTime}</span>
            <span>{qual ? qual.name : "ohne Qualifikation"}</span>
            <span>
              {wartend
                ? `${freiePlaetze} von ${shift.seats} Plätzen noch frei`
                : `${shift.assigned.length} von ${shift.seats} Plätzen besetzt`}
            </span>
          </div>
        </div>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="sb-ticket-detail">
          <div className="sb-detail-grid">
            <div><span className="sb-detail-label">Datum</span>{fmtDate(shift.date)}</div>
            <div><span className="sb-detail-label">Qualifikation</span>{qual ? qual.name : "keine"}</div>
            <div><span className="sb-detail-label">Plätze</span>{shift.assigned.length} von {shift.seats} besetzt</div>
            {wartend ? (
              <div>
                <span className="sb-detail-label">Auslosung am</span>
                {assignmentDay ? fmtDate(assignmentDateOf(shift.date, assignmentDay)) : "–"}
              </div>
            ) : (
              <div>
                <span className="sb-detail-label">Zugeteilt am</span>
                {shift.assignedAt ? fmtDate(shift.assignedAt) : "–"}
              </div>
            )}
          </div>

          {wartend ? (
            <>
              <p className="sb-status">
                Bis zur Auslosung ist der Platz nicht sicher. Gehst du leer aus, verschwindet
                die Schicht hier von selbst.
              </p>
              <button type="button" className="sb-btn sb-btn-quiet" onClick={() => onWithdraw(shift.id)}>
                Einschreibung zurückziehen
              </button>
            </>
          ) : (
            <>
              <p className="sb-status">
                {askedForHelp
                  ? "Dein Hilfegesuch steht in der Übersicht – jemand mit passender Qualifikation kann übernehmen."
                  : "Du kannst nicht? Setze ein Hilfegesuch, dann sehen es alle in der Übersicht."}
              </p>
              <button
                type="button"
                className={`sb-btn ${askedForHelp ? "sb-btn-quiet" : "sb-btn-amber"}`}
                onClick={() => onAskForHelp(shift.id)}
              >
                {askedForHelp ? "Hilfegesuch zurückziehen" : "Um Hilfe bitten"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
