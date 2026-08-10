import CollapsibleBar from "../../components/CollapsibleBar.jsx";
import OverviewShiftRow from "./OverviewShiftRow.jsx";
import { isFutureOrToday } from "#shared/dates.js";

export default function OverviewTab({ shifts, qualifications, accounts, currentUser, today, onTakeOver }) {
  const future = shifts.filter((s) => isFutureOrToday(s.date, today));
  // Nur Schichten, bei denen die Zuteilung schon lief und trotzdem Plätze frei
  // blieben. Was erst später an der Reihe ist, ist noch nicht »offen«.
  const openShifts = future.filter((s) => s.assignmentAttempted && s.assigned.length < s.seats);
  const helpRequests = future.filter((s) => s.helpRequests.length > 0);

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Übersicht</h2>
          <p className="sb-tab-intro">Was gerade offen ist und wo jemand Unterstützung sucht – für alle sichtbar.</p>
        </div>
      </div>
      <CollapsibleBar
        title="Noch offene Plätze"
        count={openShifts.length}
        tone="amber"
        emptyText="Alle bereits zugeteilten Schichten sind vollständig besetzt."
      >
        {openShifts.map((s) => (
          <OverviewShiftRow key={s.id} shift={s} qualifications={qualifications} accounts={accounts} currentUser={currentUser} onTakeOver={onTakeOver} />
        ))}
      </CollapsibleBar>
      <CollapsibleBar
        title="Hilfegesuche"
        count={helpRequests.length}
        tone="petrol"
        emptyText="Zurzeit bittet niemand um Hilfe."
      >
        {helpRequests.map((s) => (
          <OverviewShiftRow key={s.id} shift={s} qualifications={qualifications} accounts={accounts} currentUser={currentUser} onTakeOver={onTakeOver} requesterIds={s.helpRequests} />
        ))}
      </CollapsibleBar>
    </div>
  );
}
