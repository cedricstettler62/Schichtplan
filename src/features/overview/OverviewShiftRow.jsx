import { useState } from "react";
import DateStub from "../../components/DateStub.jsx";
import { hasQualification } from "#shared/assignment.js";

/** Sagt konkret, warum eine Übernahme nicht geht – »nicht möglich« allein hilft niemandem. */
function blockedReason(currentUser, shift, qualified, qualName) {
  if (currentUser.role !== "employee") return "Als Admin kannst du Schichten nicht selbst übernehmen.";
  if (shift.assigned.includes(currentUser.id)) return "Du bist dieser Schicht bereits zugeteilt.";
  if (!qualified) return `Dafür fehlt dir die Qualifikation „${qualName || "der Schicht"}“.`;
  return "Eine Übernahme ist hier nicht möglich.";
}

export default function OverviewShiftRow({ shift, qualifications, accounts, currentUser, onTakeOver, requesterIds }) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const qualName = qual ? qual.name : null;
  const qualified = hasQualification(accounts, currentUser.id, shift.qualificationId);
  const canTake =
    currentUser.role === "employee" && qualified && !shift.assigned.includes(currentUser.id);
  const freeSeats = shift.seats - shift.assigned.length;
  // Bei einem Hilfegesuch ist die Schicht zwar voll besetzt — genau das zu
  // melden wäre hier aber irreführend: gesucht wird ja ein Ersatz.
  const requesterCount = requesterIds ? requesterIds.length : 0;
  const seatText = requesterCount > 0
    ? (requesterCount === 1 ? "1 Person sucht Ersatz" : `${requesterCount} Personen suchen Ersatz`)
    : freeSeats > 0
      ? `${freeSeats} von ${shift.seats} Plätzen frei`
      : "alle Plätze besetzt";

  return (
    <div className="sb-ov-row">
      <button type="button" className="sb-ov-row-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <DateStub iso={shift.date} />
        <div className="sb-ov-row-main">
          <div className="sb-ov-row-title">{shift.name}</div>
          <div className="sb-ov-row-sub">
            {shift.startTime}–{shift.endTime} · {qualName || "ohne Qualifikation"} · {seatText}
          </div>
        </div>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-ov-row-detail">
          {requesterIds && requesterIds.length > 0 ? (
            requesterIds.map((rid) => {
              const person = accounts.find((a) => a.id === rid);
              const firstName = person ? person.name.split(" ")[0] : null;
              return (
                <div key={rid} className="sb-ov-help-line">
                  <span><strong>{person ? person.name : "Unbekannt"}</strong> sucht Ersatz für diese Schicht.</span>
                  {canTake && (
                    <button type="button" className="sb-btn sb-btn-petrol" onClick={() => onTakeOver(shift.id, currentUser.id, rid)}>
                      {firstName ? `Für ${firstName} übernehmen` : "Übernehmen"}
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
            ) : null
          )}
          {!canTake && <p className="sb-empty">{blockedReason(currentUser, shift, qualified, qualName)}</p>}
        </div>
      )}
    </div>
  );
}
