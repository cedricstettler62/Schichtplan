import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import DateStub from "../../components/DateStub.jsx";
import { fmtDate } from "#shared/dates.js";

export default function MyShiftRow({ shift, qualifications, currentUser, onAskForHelp }) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const askedForHelp = shift.helpRequests.includes(currentUser.id);

  return (
    <div className="sb-ticket sb-ticket-expandable">
      <button type="button" className="sb-ticket-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <DateStub iso={shift.date} />
        <div className="sb-ticket-body">
          <div className="sb-ticket-top">
            <span className="sb-ticket-name">{shift.name}</span>
            {askedForHelp && <Badge tone="amber">Hilfe gesucht</Badge>}
          </div>
          <div className="sb-ticket-meta">
            <span className="sb-mono">{shift.startTime}–{shift.endTime}</span>
            <span>{qual ? qual.name : "ohne Qualifikation"}</span>
            <span>{shift.assigned.length} von {shift.seats} Plätzen besetzt</span>
          </div>
        </div>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-myshift-detail">
          <div className="sb-detail-grid">
            <div><span className="sb-detail-label">Datum</span>{fmtDate(shift.date)}</div>
            <div><span className="sb-detail-label">Qualifikation</span>{qual ? qual.name : "keine"}</div>
            <div><span className="sb-detail-label">Plätze</span>{shift.assigned.length} von {shift.seats} besetzt</div>
            <div><span className="sb-detail-label">Zugeteilt am</span>{shift.assignedAt ? fmtDate(shift.assignedAt) : "–"}</div>
          </div>
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
        </div>
      )}
    </div>
  );
}
