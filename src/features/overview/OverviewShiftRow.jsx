import { useState } from "react";
import DateStub from "../../components/DateStub.jsx";
import { hasQualifications } from "#shared/assignment.js";
import { qualifikationsListe, qualifikationsNamen } from "#shared/labels.js";

/** Sagt konkret, warum eine Übernahme nicht geht – »nicht möglich« allein hilft
 *  niemandem, und bei mehreren Anforderungen erst recht nicht. */
function blockedReason(currentUser, shift, qualified, fehlend) {
  if (shift.assigned.includes(currentUser.id)) return "Du bist dieser Schicht bereits zugeteilt.";
  if (!qualified) {
    return fehlend.length
      ? `Dafür fehlt dir: ${fehlend.join(", ")}.`
      : "Für diese Schicht ist keine Qualifikation hinterlegt — sie lässt sich deshalb nicht übernehmen.";
  }
  return "Eine Übernahme ist hier nicht möglich.";
}

export default function OverviewShiftRow({ shift, qualifications, accounts, currentUser, onTakeOver, requesterIds }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const uebernehmen = async (replaceId) => {
    setError((await onTakeOver(shift.id, replaceId)) || "");
  };
  const qualNames = qualifikationsListe(qualifications, shift.qualificationIds);
  const qualified = hasQualifications(accounts, currentUser.id, shift.qualificationIds);
  const fehlend = qualifikationsNamen(
    qualifications,
    (shift.qualificationIds || []).filter((id) => !currentUser.qualifications.includes(id))
  );
  const canTake = qualified && !shift.assigned.includes(currentUser.id);
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
            {shift.startTime}–{shift.endTime} · {qualNames || "ohne Qualifikation"} · {seatText}
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
                    <button type="button" className="sb-btn sb-btn-petrol" onClick={() => uebernehmen(rid)}>
                      {firstName ? `Für ${firstName} übernehmen` : "Übernehmen"}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            canTake ? (
              <button type="button" className="sb-btn sb-btn-petrol" onClick={() => uebernehmen(null)}>
                Schicht übernehmen
              </button>
            ) : null
          )}
          {!canTake && <p className="sb-empty">{blockedReason(currentUser, shift, qualified, fehlend)}</p>}
          {error && <p className="sb-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
