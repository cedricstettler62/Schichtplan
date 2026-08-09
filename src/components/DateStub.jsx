import { shortDay, shortMonth, shortWeekday } from "#shared/dates.js";

export default function DateStub({ iso }) {
  return (
    <div className="sb-date-stub">
      <div className="sb-date-wd">{shortWeekday(iso)}</div>
      <div className="sb-date-day">{shortDay(iso)}</div>
      <div className="sb-date-mo">{shortMonth(iso)}</div>
    </div>
  );
}
