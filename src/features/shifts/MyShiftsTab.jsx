import MyShiftRow from "./MyShiftRow.jsx";
import { isFutureOrToday } from "#shared/dates.js";

/*
 * Zwei Listen statt einer: Was fest zugeteilt ist, und was noch auf die
 * Auslosung wartet. Wer bei der Auslosung leer ausgeht, verschwindet hier
 * automatisch — die Warteliste wird beim Zuteilen aufgelöst.
 */
export default function MyShiftsTab({
  shifts, qualifications, currentUser, today, assignmentDay, onAskForHelp, onWithdraw,
}) {
  const kommend = shifts
    .filter((s) => isFutureOrToday(s.date, today))
    .sort((a, b) => a.date.localeCompare(b.date));

  const zugeteilt = kommend.filter((s) => s.assigned.includes(currentUser.id));
  const eingeschrieben = kommend.filter(
    (s) => s.enrolled.includes(currentUser.id) && !s.assigned.includes(currentUser.id)
  );

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Meine Schichten</h2>
          <p className="sb-tab-intro">Deine festen Zuteilungen und die Einschreibungen, über die noch entschieden wird. Antippen für Details.</p>
        </div>
      </div>

      <div className="sb-tab-section">
        <h3 className="sb-subheading">Zugeteilte Schichten</h3>
        {zugeteilt.length === 0 ? (
          <p className="sb-empty">Dir ist zurzeit keine Schicht zugeteilt.</p>
        ) : (
          <div className="sb-shift-list">
            {zugeteilt.map((s) => (
              <MyShiftRow
                key={s.id} shift={s} qualifications={qualifications}
                currentUser={currentUser} onAskForHelp={onAskForHelp}
              />
            ))}
          </div>
        )}
      </div>

      <div className="sb-tab-section">
        <h3 className="sb-subheading">Eingeschriebene Schichten</h3>
        {eingeschrieben.length === 0 ? (
          <p className="sb-empty">Du wartest auf keine Zuteilung.</p>
        ) : (
          <div className="sb-shift-list">
            {eingeschrieben.map((s) => (
              <MyShiftRow
                key={s.id} shift={s} qualifications={qualifications}
                currentUser={currentUser} assignmentDay={assignmentDay} onWithdraw={onWithdraw}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
