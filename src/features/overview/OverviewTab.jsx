import CollapsibleBar from "../../components/CollapsibleBar.jsx";
import TabHead from "../../components/TabHead.jsx";
import OverviewShiftRow from "./OverviewShiftRow.jsx";
import LogbookRequestRow from "./LogbookRequestRow.jsx";
import { isFutureOrToday } from "#shared/dates.js";

export default function OverviewTab({
  shifts, qualifications, accounts, currentUser, today, onTakeOver,
  logbookAccessRequests, onApproveLogbookRequest, onDeclineLogbookRequest,
}) {
  const future = shifts.filter((s) => isFutureOrToday(s.date, today));
  // Nur Schichten, bei denen die Zuteilung schon lief und trotzdem Plätze frei
  // blieben. Was erst später an der Reihe ist, ist noch nicht »offen«.
  const openShifts = future.filter((s) => s.assignmentAttempted && s.assigned.length < s.seats);
  const helpRequests = future.filter((s) => s.helpRequests.length > 0);
  const isAdmin = currentUser.role === "admin";
  const pendingLogbookRequests = isAdmin
    ? (logbookAccessRequests || []).filter((r) => r.status === "pending")
    : [];

  return (
    <div className="sb-tab">
      <TabHead titel="Übersicht" intro="Was gerade offen ist und wo jemand Unterstützung sucht – für alle sichtbar." />
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
      {isAdmin && (
        <CollapsibleBar
          title="Logbuch-Anfragen"
          count={pendingLogbookRequests.length}
          tone="ink"
          emptyText="Zurzeit liegt keine Einsichtsanfrage vor."
        >
          {pendingLogbookRequests.map((r) => (
            <LogbookRequestRow key={r.id} request={r} onApprove={onApproveLogbookRequest} onDecline={onDeclineLogbookRequest} />
          ))}
        </CollapsibleBar>
      )}
    </div>
  );
}
