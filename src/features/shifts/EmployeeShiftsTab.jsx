import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import Chip from "../../components/Chip.jsx";
import QualFilterChips from "../../components/QualFilterChips.jsx";
import DateStub from "../../components/DateStub.jsx";
import { fromISO, isFutureOrToday, monthDiff } from "#shared/dates.js";
import { hasQualifications } from "#shared/assignment.js";
import { qualifikationsListe, qualifikationsNamen } from "#shared/labels.js";

export default function EmployeeShiftsTab({ shifts, qualifications, accounts, currentUser, today, onToggleEnroll }) {
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [onlyEnrolled, setOnlyEnrolled] = useState(false);
  const [qualFilter, setQualFilter] = useState([]);
  const [enrollError, setEnrollError] = useState(null); // { shiftId, message }

  const base = shifts.filter((s) => isFutureOrToday(s.date, today) && monthDiff(today, fromISO(s.date)) >= 1);
  const visible = onlyEnrolled
    ? base.filter((s) => s.enrolled.includes(currentUser.id))
    : base.filter((s) => s.assigned.length < s.seats);

  const filtered = visible.filter((s) => {
    if (onlyMatching && !hasQualifications(accounts, currentUser.id, s.qualificationIds)) return false;
    if (qualFilter.length > 0 && !s.qualificationIds.some((id) => qualFilter.includes(id))) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  /* Sagt, was genau fehlt: Bei mehreren Anforderungen hilft „dir fehlt eine
     Qualifikation“ niemandem weiter. */
  const fehlendeNamen = (s) =>
    qualifikationsNamen(
      qualifications,
      (s.qualificationIds || []).filter((id) => !currentUser.qualifications.includes(id))
    ).join(", ");

  const handleClick = async (s, qualified, enrolled) => {
    if (!qualified && !enrolled) {
      const fehlt = fehlendeNamen(s);
      setEnrollError({
        shiftId: s.id,
        message: fehlt
          ? `Dafür fehlt dir: ${fehlt}. Wende dich an einen Admin, wenn das nicht stimmt.`
          : "Für diese Schicht ist keine Qualifikation hinterlegt — sie lässt sich deshalb nicht übernehmen.",
      });
      return;
    }
    setEnrollError(null);
    // Etwa eine Überschneidung mit einer Schicht, für die man schon eingetragen ist.
    const meldung = await onToggleEnroll(s.id);
    if (meldung) setEnrollError({ shiftId: s.id, message: meldung });
  };

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Schichten</h2>
          <p className="sb-tab-intro">Offene Schichten ab dem nächsten Monat. Einschreiben genügt – zugeteilt wird automatisch.</p>
        </div>
      </div>
      <div className="sb-filter-row">
        <div className="sb-chip-row">
          <Chip active={onlyMatching} onClick={() => setOnlyMatching((v) => !v)}>Passende Qualifikationen</Chip>
          <Chip active={onlyEnrolled} onClick={() => setOnlyEnrolled((v) => !v)}>Bereits eingeschrieben</Chip>
        </div>
        <QualFilterChips qualifications={qualifications} gewaehlt={qualFilter} setGewaehlt={setQualFilter} />
      </div>

      <div className="sb-shift-list">
        {filtered.length === 0 && (
          <p className="sb-empty">
            {onlyEnrolled ? "Du hast dich noch für keine Schicht eingeschrieben." : "Zu diesen Filtern gibt es keine offenen Schichten."}
          </p>
        )}
        {filtered.map((s) => {
          const qualNames = qualifikationsListe(qualifications, s.qualificationIds);
          const enrolled = s.enrolled.includes(currentUser.id);
          const assignedToMe = s.assigned.includes(currentUser.id);
          const qualified = hasQualifications(accounts, currentUser.id, s.qualificationIds);
          return (
            <div key={s.id}>
              <div className="sb-ticket">
                <DateStub iso={s.date} />
                <div className="sb-ticket-body">
                  <div className="sb-ticket-top">
                    <span className="sb-ticket-name">{s.name}</span>
                    {assignedToMe && <Badge tone="petrol">Zugeteilt</Badge>}
                    {enrolled && !assignedToMe && <Badge tone="ink">Eingeschrieben</Badge>}
                    {!qualified && <Badge tone="rust">Qualifikation fehlt</Badge>}
                  </div>
                  <div className="sb-ticket-meta">
                    <span className="sb-mono">{s.startTime}–{s.endTime}</span>
                    <span>{qualNames || "ohne Qualifikation"}</span>
                    <span>{s.seats - s.assigned.length} von {s.seats} Plätzen frei</span>
                  </div>
                </div>
                {assignedToMe ? (
                  /* Kein Knopf, der ohnehin abgewiesen würde – lieber sagen, warum. */
                  <span className="sb-ticket-action sb-status">Austragen nur über Admin</span>
                ) : (
                  <button
                    type="button"
                    className={`sb-btn sb-ticket-action ${enrolled ? "sb-btn-quiet" : "sb-btn-petrol"}`}
                    onClick={() => handleClick(s, qualified, enrolled)}
                  >
                    {enrolled ? "Austragen" : "Einschreiben"}
                  </button>
                )}
              </div>
              {enrollError && enrollError.shiftId === s.id && <p className="sb-error sb-ticket-error">{enrollError.message}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
