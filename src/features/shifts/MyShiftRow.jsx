import { useState } from "react";
import { fmtDate } from "#shared/dates.js";
import { REPEAT_LABELS } from "#shared/labels.js";

export default function MyShiftRow({ shift, qualifications, currentUser, onAskForHelp }) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const askedForHelp = shift.helpRequests.includes(currentUser.id);

  return (
    <div className="sb-myshift">
      <button type="button" className="sb-myshift-row" onClick={() => setOpen((o) => !o)}>
        <span className="sb-myshift-name">{shift.name}</span>
        <span className="sb-mono">{fmtDate(shift.date)}</span>
        <span className="sb-mono">{shift.startTime}–{shift.endTime}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-myshift-detail">
          <div className="sb-detail-grid">
            <div><span className="sb-detail-label">Ausbildung</span><br />{qual ? qual.name : "–"}</div>
            <div><span className="sb-detail-label">Wiederholung</span><br />{REPEAT_LABELS[shift.repeat]}</div>
            <div><span className="sb-detail-label">Plätze</span><br />{shift.assigned.length}/{shift.seats}</div>
            <div><span className="sb-detail-label">Zuteilungsdatum</span><br />{shift.assignedAt ? fmtDate(shift.assignedAt) : "–"}</div>
          </div>
          <button
            type="button"
            className={`sb-btn ${askedForHelp ? "sb-btn-rust" : "sb-btn-amber"}`}
            onClick={() => onAskForHelp(shift.id)}
          >
            {askedForHelp ? "Hilfegesuch zurückziehen" : "Um Hilfe bitten"}
          </button>
        </div>
      )}
    </div>
  );
}
