import { useState } from "react";
import DateStub from "../../components/DateStub.jsx";
import { hasQualification } from "#shared/assignment.js";

export default function OverviewShiftRow({ shift, qualifications, accounts, currentUser, onTakeOver, requesterIds }) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const canTake =
    currentUser.role === "employee" &&
    hasQualification(accounts, currentUser.id, shift.qualificationId) &&
    !shift.assigned.includes(currentUser.id);

  return (
    <div className="sb-ov-row">
      <button type="button" className="sb-ov-row-head" onClick={() => setOpen((o) => !o)}>
        <DateStub iso={shift.date} />
        <div className="sb-ov-row-main">
          <div className="sb-ov-row-title">{shift.name}</div>
          <div className="sb-ov-row-sub">{shift.startTime}–{shift.endTime} · {qual ? qual.name : "– keine Qualifikation –"} · {shift.assigned.length}/{shift.seats} Plätze</div>
        </div>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-ov-row-detail">
          {requesterIds && requesterIds.length > 0 ? (
            requesterIds.map((rid) => {
              const person = accounts.find((a) => a.id === rid);
              return (
                <div key={rid} className="sb-ov-help-line">
                  <span>Hilfegesuch von <strong>{person ? person.name : "?"}</strong></span>
                  {canTake && (
                    <button type="button" className="sb-btn sb-btn-petrol" onClick={() => onTakeOver(shift.id, currentUser.id, rid)}>
                      Für {person ? person.name.split(" ")[0] : ""} übernehmen
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            canTake ? (
              <button type="button" className="sb-btn sb-btn-petrol" onClick={() => onTakeOver(shift.id, currentUser.id, null)}>
                Schicht übernehmen
              </button>
            ) : (
              <p className="sb-empty">Keine passende, freie Übernahme möglich.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
