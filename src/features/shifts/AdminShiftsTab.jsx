import { useState } from "react";
import QualFilterChips from "../../components/QualFilterChips.jsx";
import AdminShiftRow from "./AdminShiftRow.jsx";
import NewShiftForm from "./NewShiftForm.jsx";
import { addDays, fromISO, isFutureOrToday, monthDiff } from "#shared/dates.js";
import { HORIZON_DAYS } from "#shared/assignment.js";
import { qualifikationsListe } from "#shared/labels.js";

export default function AdminShiftsTab({
  shifts, qualifications, accounts, combinableSeries, today,
  onCreate, onAddQualification, onForceAssign, onDirectAssign, onRemoveEnrollment, onUpdateShift,
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
    // Gezeigt wird, was mindestens eine der angetippten Qualifikationen verlangt.
    if (qualFilter.length > 0 && !s.qualificationIds.some((id) => qualFilter.includes(id))) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

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
          /* Nur bei Erfolg schliessen: Sonst wäre die Eingabe weg und die
             Meldung, warum es nicht ging, gleich mit. */
          onCreate={async (f) => {
            const meldung = await onCreate(f);
            if (!meldung) setFormOpen(false);
            return meldung;
          }}
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
        <QualFilterChips qualifications={qualifications} gewaehlt={qualFilter} setGewaehlt={setQualFilter} />
      </div>

      <div className="sb-shift-list">
        {filtered.length === 0 && <p className="sb-empty">Zu diesen Filtern gibt es keine Schichten.</p>}
        {filtered.map((s) => (
          <AdminShiftRow
            key={s.id}
            shift={s}
            qualNames={qualifikationsListe(qualifications, s.qualificationIds)}
            accounts={accounts}
            qualifications={qualifications}
            /* Nur kommende Termine: Vergangene lassen sich ohnehin nicht ändern. */
            seriesShifts={visible.filter((x) => x.seriesId === s.seriesId)}
            shifts={visible}
            combinableSeries={combinableSeries}
            onForceAssign={onForceAssign}
            onDirectAssign={onDirectAssign}
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
