import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import Chip from "../../components/Chip.jsx";
import DateStub from "../../components/DateStub.jsx";
import { fromISO, isFutureOrToday, monthDiff } from "#shared/dates.js";
import { hasQualification } from "#shared/assignment.js";
import { REPEAT_LABELS } from "#shared/labels.js";

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
    if (onlyMatching && !hasQualification(accounts, currentUser.id, s.qualificationId)) return false;
    if (qualFilter.length > 0 && !qualFilter.includes(s.qualificationId)) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const toggleQual = (id) => setQualFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const handleClick = (s, qualified, enrolled, qualName) => {
    if (!qualified && !enrolled) {
      setEnrollError({ shiftId: s.id, message: `Du kannst dich für diese Schicht nicht einschreiben, da du in ${qualName || "der erforderlichen Qualifikation"} nicht ausgebildet bist.` });
      return;
    }
    setEnrollError(null);
    onToggleEnroll(s.id);
  };

  return (
    <div className="sb-tab">
      <p className="sb-tab-intro">Offene Schichten ab dem nächsten Monat. Einschreiben reicht – die Zuteilung erfolgt automatisch.</p>
      <div className="sb-filter-row">
        <label className="sb-checkbox-row">
          <input type="checkbox" checked={onlyMatching} onChange={(e) => setOnlyMatching(e.target.checked)} />
          <span>Nur mit passender Ausbildung</span>
        </label>
        <label className="sb-checkbox-row">
          <input type="checkbox" checked={onlyEnrolled} onChange={(e) => setOnlyEnrolled(e.target.checked)} />
          <span>Nur eigene Einschreibungen</span>
        </label>
        <div className="sb-chip-row">
          {qualifications.map((q) => (
            <Chip key={q.id} active={qualFilter.includes(q.id)} onClick={() => toggleQual(q.id)}>{q.name}</Chip>
          ))}
        </div>
      </div>

      <div className="sb-shift-list">
        {filtered.length === 0 && <p className="sb-empty">Keine offenen Schichten für diese Filter.</p>}
        {filtered.map((s) => {
          const qual = qualifications.find((q) => q.id === s.qualificationId);
          const enrolled = s.enrolled.includes(currentUser.id);
          const qualified = hasQualification(accounts, currentUser.id, s.qualificationId);
          return (
            <div key={s.id}>
              <div className="sb-ticket">
                <DateStub iso={s.date} />
                <div className="sb-ticket-body">
                  <div className="sb-ticket-top">
                    <span className="sb-ticket-name">{s.name}</span>
                    {!qualified && <Badge tone="rust">Ausbildung fehlt</Badge>}
                  </div>
                  <div className="sb-ticket-meta">
                    <span className="sb-mono">{s.startTime}–{s.endTime}</span>
                    <span>{qual ? qual.name : "–"}</span>
                    <span>{s.seats - s.assigned.length} von {s.seats} frei</span>
                    <span>{REPEAT_LABELS[s.repeat]}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`sb-btn sb-ticket-action ${enrolled ? "sb-btn-rust" : "sb-btn-petrol"}`}
                  onClick={() => handleClick(s, qualified, enrolled, qual ? qual.name : null)}
                >
                  {enrolled ? "Abmelden" : "Einschreiben"}
                </button>
              </div>
              {enrollError && enrollError.shiftId === s.id && <p className="sb-error sb-ticket-error">{enrollError.message}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
