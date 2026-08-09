import { useState } from "react";
import { fmtDate } from "#shared/dates.js";
import { REPEAT_LABELS } from "#shared/labels.js";

export default function MyShiftRow({ shift, qualifications, currentUser, onAskForHelp }) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const askedForHelp = shift.helpRequests.includes(currentUser.id);

  return (
    <div className="sb-myshift">
      <button type="button" className="sb-myshift-row" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="sb-myshift-name">{shift.name}</span>
        <span className="sb-mono">{fmtDate(shift.date)}</span>
        <span className="sb-mono">{shift.startTime}–{shift.endTime}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-myshift-detail">
          <div className="sb-detail-grid">
            <div><span className="sb-detail-label">Qualifikation</span>{qual ? qual.name : "keine"}</div>
            <div><span className="sb-detail-label">Wiederholung</span>{REPEAT_LABELS[shift.repeat]}</div>
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
