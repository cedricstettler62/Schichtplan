import { useState } from "react";
import Chip from "../../components/Chip.jsx";
import AdminShiftRow from "./AdminShiftRow.jsx";
import NewShiftForm from "./NewShiftForm.jsx";
import { addDays, fromISO, isFutureOrToday, monthDiff } from "#shared/dates.js";
import { HORIZON_DAYS } from "#shared/assignment.js";

export default function AdminShiftsTab({
  shifts, qualifications, accounts, combinableSeries, today,
  onCreate, onAddQualification, onForceAssign, onRemoveEnrollment, onUpdateShift,
  onDeleteShift, onDeleteSeries,
}) {
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
          <p className="sb-tab-intro">Alle Schichten der nächsten {HORIZON_DAYS} Tage. Aufklappen zeigt, wer eingeschrieben und zugeteilt ist.</p>
        </div>
        <button type="button" className={`sb-btn ${formOpen ? "sb-btn-quiet" : "sb-btn-amber"}`} onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Abbrechen" : "Neue Schicht"}
        </button>
      </div>
      {formOpen && (
        <NewShiftForm
          qualifications={qualifications}
          shifts={visible}
          onCreate={async (f) => { await onCreate(f); setFormOpen(false); }}
          onAddQualification={onAddQualification}
        />
      )}

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
        {filtered.map((s) => (
          <AdminShiftRow
            key={s.id}
            shift={s}
            qualName={qualifications.find((q) => q.id === s.qualificationId)?.name}
            accounts={accounts}
            qualifications={qualifications}
            /* Nur kommende Termine: Vergangene lassen sich ohnehin nicht ändern. */
            seriesShifts={visible.filter((x) => x.seriesId === s.seriesId)}
            shifts={visible}
            combinableSeries={combinableSeries}
            onForceAssign={onForceAssign}
            onRemoveEnrollment={onRemoveEnrollment}
            onUpdateShift={onUpdateShift}
            onDeleteShift={onDeleteShift}
            onDeleteSeries={onDeleteSeries}
          />
        ))}
      </div>
    </div>
  );
}
