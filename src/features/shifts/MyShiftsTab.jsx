import MyShiftRow from "./MyShiftRow.jsx";
import { isFutureOrToday } from "#shared/dates.js";

export default function MyShiftsTab({ shifts, qualifications, currentUser, today, onAskForHelp }) {
  const mine = shifts
    .filter((s) => s.assigned.includes(currentUser.id) && isFutureOrToday(s.date, today))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="sb-tab">
      <p className="sb-tab-intro">Deine zugeteilten Schichten.</p>
      {mine.length === 0 && <p className="sb-empty">Aktuell bist du keiner Schicht zugeteilt.</p>}
      <div className="sb-myshifts-list">
        {mine.map((s) => <MyShiftRow key={s.id} shift={s} qualifications={qualifications} currentUser={currentUser} onAskForHelp={onAskForHelp} />)}
      </div>
    </div>
  );
}
