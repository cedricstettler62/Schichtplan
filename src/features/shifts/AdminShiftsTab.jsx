import { useState } from "react";
import Badge from "../../components/Badge.jsx";
import Chip from "../../components/Chip.jsx";
import DateStub from "../../components/DateStub.jsx";
import NewShiftForm from "./NewShiftForm.jsx";
import { addDays, fromISO, isFutureOrToday, monthDiff } from "#shared/dates.js";
import { HORIZON_DAYS } from "#shared/assignment.js";
import { REPEAT_LABELS } from "#shared/labels.js";

export default function AdminShiftsTab({ shifts, qualifications, today, onCreate, onAddQualification, onForceAssign }) {
  const [formOpen, setFormOpen] = useState(false);
  const [status, setStatus] = useState("all");
  const [qualFilter, setQualFilter] = useState([]);

  const horizon = addDays(today, HORIZON_DAYS);
  const visible = shifts.filter((s) => isFutureOrToday(s.date, today) && fromISO(s.date) <= horizon);

  const filtered = visible.filter((s) => {
    if (status === "assigned" && s.assigned.length < s.seats) return false;
    if (status === "open" && s.assigned.length >= s.seats) return false;
    if (status === "future" && monthDiff(today, fromISO(s.date)) < 2) return false;
    if (qualFilter.length > 0 && !qualFilter.includes(s.qualificationId)) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const toggleQual = (id) => setQualFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Schichten</h2>
          <p className="sb-tab-intro">Alle Schichten der nächsten {HORIZON_DAYS} Tage. Neue anlegen oder offene sofort zuteilen.</p>
        </div>
        <button type="button" className={`sb-btn ${formOpen ? "sb-btn-quiet" : "sb-btn-amber"}`} onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Abbrechen" : "Neue Schicht"}
        </button>
      </div>
      {formOpen && <NewShiftForm qualifications={qualifications} onCreate={async (f) => { await onCreate(f); setFormOpen(false); }} onAddQualification={onAddQualification} />}

      <div className="sb-filter-row">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="sb-select-inline" aria-label="Nach Status filtern">
          <option value="all">Alle Schichten</option>
          <option value="assigned">Nur vollständig besetzte</option>
          <option value="open">Nur mit freien Plätzen</option>
          <option value="future">Erst ab übernächstem Monat</option>
        </select>
        <div className="sb-chip-row">
          {qualifications.map((q) => (
            <Chip key={q.id} active={qualFilter.includes(q.id)} onClick={() => toggleQual(q.id)}>{q.name}</Chip>
          ))}
        </div>
      </div>

      <div className="sb-shift-list">
        {filtered.length === 0 && <p className="sb-empty">Zu diesen Filtern gibt es keine Schichten.</p>}
        {filtered.map((s) => {
          const qual = qualifications.find((q) => q.id === s.qualificationId);
          const full = s.assigned.length >= s.seats;
          return (
            <div key={s.id} className="sb-ticket">
              <DateStub iso={s.date} />
              <div className="sb-ticket-body">
                <div className="sb-ticket-top">
                  <span className="sb-ticket-name">{s.name}</span>
                  <Badge tone={full ? "petrol" : "amber"}>{full ? "Besetzt" : "Freie Plätze"}</Badge>
                </div>
                <div className="sb-ticket-meta">
                  <span className="sb-mono">{s.startTime}–{s.endTime}</span>
                  <span>{qual ? qual.name : "ohne Qualifikation"}</span>
                  <span>{s.assigned.length} von {s.seats} Plätzen besetzt</span>
                  <span>{s.enrolled.length} eingeschrieben</span>
                  <span>{REPEAT_LABELS[s.repeat]}</span>
                </div>
              </div>
              {!full && (
                <button
                  type="button"
                  className="sb-btn sb-btn-petrol sb-ticket-action"
                  onClick={() => onForceAssign(s.id)}
                  disabled={s.enrolled.length === 0}
                  title={s.enrolled.length === 0 ? "Niemand ist für diese Schicht eingeschrieben." : undefined}
                >
                  Jetzt zuteilen
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
