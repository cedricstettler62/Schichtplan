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
      <div className="sb-tab-toolbar">
        <button type="button" className="sb-btn sb-btn-amber" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Formular schliessen" : "+ Neue Schicht"}
        </button>
      </div>
      {formOpen && <NewShiftForm qualifications={qualifications} onCreate={async (f) => { await onCreate(f); setFormOpen(false); }} onAddQualification={onAddQualification} />}

      <div className="sb-filter-row">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="sb-select-inline">
          <option value="all">Alle</option>
          <option value="assigned">Zugeteilt</option>
          <option value="open">Offen</option>
          <option value="future">Zukünftige Schichten</option>
        </select>
        <div className="sb-chip-row">
          {qualifications.map((q) => (
            <Chip key={q.id} active={qualFilter.includes(q.id)} onClick={() => toggleQual(q.id)}>{q.name}</Chip>
          ))}
        </div>
      </div>

      <div className="sb-shift-list">
        {filtered.length === 0 && <p className="sb-empty">Keine Schichten für diese Filter.</p>}
        {filtered.map((s) => {
          const qual = qualifications.find((q) => q.id === s.qualificationId);
          const full = s.assigned.length >= s.seats;
          return (
            <div key={s.id} className="sb-ticket">
              <DateStub iso={s.date} />
              <div className="sb-ticket-body">
                <div className="sb-ticket-top">
                  <span className="sb-ticket-name">{s.name}</span>
                  <Badge tone={full ? "petrol" : "amber"}>{full ? "Zugeteilt" : "Offen"}</Badge>
                </div>
                <div className="sb-ticket-meta">
                  <span className="sb-mono">{s.startTime}–{s.endTime}</span>
                  <span>{qual ? qual.name : "– keine Qualifikation –"}</span>
                  <span>{s.assigned.length}/{s.seats} Plätze</span>
                  <span>{s.enrolled.length} eingeschrieben</span>
                  <span>{REPEAT_LABELS[s.repeat]}</span>
                </div>
              </div>
              {!full && (
                <button type="button" className="sb-btn sb-btn-petrol sb-ticket-action" onClick={() => onForceAssign(s.id)}>
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
