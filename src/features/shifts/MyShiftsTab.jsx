import MyShiftRow from "./MyShiftRow.jsx";
import { isFutureOrToday } from "#shared/dates.js";

/*
 * Drei Listen: Was fest zugeteilt ist, was noch auf die Auslosung wartet, und
 * was schon vorbei ist. Wer bei der Auslosung leer ausgeht, verschwindet aus
 * der mittleren Liste — die Warteliste wird beim Zuteilen aufgelöst.
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
  /* Was man tatsächlich geleistet hat — sonst gibt es dafür keine Ansicht, und
     „habe ich letzten Monat gearbeitet?“ könnte niemand mehr beantworten.
     Weiter als fünf Jahre zurück steht ohnehin nichts mehr in der Datenbank. */
  const vergangen = shifts
    .filter((s) => !isFutureOrToday(s.date, today) && s.assigned.includes(currentUser.id))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Meine Schichten</h2>
          <p className="sb-tab-intro">Deine festen Zuteilungen, die Einschreibungen, über die noch entschieden wird, und was schon hinter dir liegt. Antippen für Details.</p>
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

      <div className="sb-tab-section">
        <h3 className="sb-subheading">Vergangene Schichten</h3>
        {vergangen.length === 0 ? (
          <p className="sb-empty">Hier steht, was du bereits geleistet hast – bisher nichts.</p>
        ) : (
          <div className="sb-shift-list">
            {vergangen.map((s) => (
              <MyShiftRow
                key={s.id} shift={s} qualifications={qualifications} currentUser={currentUser}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
