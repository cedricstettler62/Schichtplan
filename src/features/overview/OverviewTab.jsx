import CollapsibleBar from "../../components/CollapsibleBar.jsx";
import OverviewShiftRow from "./OverviewShiftRow.jsx";
import { isFutureOrToday } from "#shared/dates.js";

export default function OverviewTab({ shifts, qualifications, accounts, currentUser, today, onTakeOver }) {
  const future = shifts.filter((s) => isFutureOrToday(s.date, today));
  const openShifts = future.filter((s) => s.assigned.length < s.seats);
  const helpRequests = future.filter((s) => s.helpRequests.length > 0);

  return (
    <div className="sb-tab">
      <p className="sb-tab-intro">Ein gemeinsamer Feed für alle: offene Schichten, unbesetzte Zuteilungen und Hilfegesuche.</p>
      <CollapsibleBar title="Unbesetzte Schichten" count={openShifts.length} tone="amber">
        {openShifts.map((s) => (
          <OverviewShiftRow key={s.id} shift={s} qualifications={qualifications} accounts={accounts} currentUser={currentUser} onTakeOver={onTakeOver} />
        ))}
      </CollapsibleBar>
      <CollapsibleBar title="Hilfegesuche" count={helpRequests.length} tone="petrol">
        {helpRequests.map((s) => (
          <OverviewShiftRow key={s.id} shift={s} qualifications={qualifications} accounts={accounts} currentUser={currentUser} onTakeOver={onTakeOver} requesterIds={s.helpRequests} />
        ))}
      </CollapsibleBar>
    </div>
  );
}
