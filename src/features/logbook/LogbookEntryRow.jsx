import Badge from "../../components/Badge.jsx";

const TYPE_INFO = {
  created: ["Angelegt", "petrol"],
  updated: ["Bearbeitet", "ink"],
  assigned: ["Zugeteilt", "petrol"],
  unassigned: ["Ausgetragen", "rust"],
  reassigned: ["Übernommen", "amber"],
  help_requested: ["Hilfegesuch", "amber"],
  help_withdrawn: ["Hilfegesuch zurück", "ink"],
};

function fmtWhen(iso) {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export default function LogbookEntryRow({ entry }) {
  const [label, tone] = TYPE_INFO[entry.type] || [entry.type, "ink"];
  return (
    <div className="sb-log-row">
      <div className="sb-log-row-head">
        <Badge tone={tone}>{label}</Badge>
        <span className="sb-log-row-shift">{entry.shiftLabel}</span>
        <span className="sb-log-row-when sb-mono">{fmtWhen(entry.createdAt)}</span>
      </div>
      <p className="sb-log-row-msg">{entry.message}</p>
    </div>
  );
}
