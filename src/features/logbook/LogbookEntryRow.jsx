import Badge from "../../components/Badge.jsx";
import { fmtZeitpunkt } from "#shared/dates.js";

const TYPE_INFO = {
  created: ["Angelegt", "petrol"],
  updated: ["Bearbeitet", "ink"],
  deleted: ["Gelöscht", "rust"],
  assigned: ["Zugeteilt", "petrol"],
  unassigned: ["Ausgetragen", "rust"],
  reassigned: ["Übernommen", "amber"],
  help_requested: ["Hilfegesuch", "amber"],
  help_withdrawn: ["Hilfegesuch zurück", "ink"],
  account_updated: ["Konto geändert", "petrol"],
  password_changed: ["Passwort geändert", "rust"],
  enrolled: ["Eingeschrieben", "amber"],
  withdrawn: ["Ausgetragen", "ink"],
};

export default function LogbookEntryRow({ entry }) {
  const [label, tone] = TYPE_INFO[entry.type] || [entry.type, "ink"];
  return (
    <div className="sb-log-row">
      <div className="sb-log-row-head">
        <Badge tone={tone}>{label}</Badge>
        <span className="sb-log-row-shift">{entry.shiftLabel}</span>
        <span className="sb-log-row-when sb-mono">{fmtZeitpunkt(entry.createdAt)}</span>
      </div>
      <p className="sb-log-row-msg">{entry.message}</p>
    </div>
  );
}
