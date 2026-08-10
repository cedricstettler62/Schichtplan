import MyShiftRow from "./MyShiftRow.jsx";
import { isFutureOrToday } from "#shared/dates.js";

export default function MyShiftsTab({ shifts, qualifications, currentUser, today, onAskForHelp }) {
  const mine = shifts
    .filter((s) => s.assigned.includes(currentUser.id) && isFutureOrToday(s.date, today))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Meine Schichten</h2>
          <p className="sb-tab-intro">Alle Schichten, die dir fest zugeteilt sind. Antippen für Details.</p>
        </div>
      </div>
      {mine.length === 0 ? (
        <p className="sb-empty">Dir ist zurzeit keine Schicht zugeteilt.</p>
      ) : (
        <div className="sb-shift-list">
          {mine.map((s) => <MyShiftRow key={s.id} shift={s} qualifications={qualifications} currentUser={currentUser} onAskForHelp={onAskForHelp} />)}
        </div>
      )}
    </div>
  );
}
