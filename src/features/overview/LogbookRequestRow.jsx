import { useState } from "react";

export default function LogbookRequestRow({ request, onApprove, onDecline }) {
  const [busy, setBusy] = useState(false);

  const entscheiden = async (fn) => {
    setBusy(true);
    await fn(request.id);
    setBusy(false);
  };

  return (
    <div className="sb-ov-row">
      <div className="sb-ov-row-main sb-log-request-main">
        <div className="sb-ov-row-title">{request.accountName}</div>
        <div className="sb-ov-row-sub">{request.shiftLabel}</div>
        {request.note && <p className="sb-log-request-note">„{request.note}“</p>}
        <div className="sb-form-actions">
          <button type="button" className="sb-btn sb-btn-petrol sb-btn-sm" disabled={busy} onClick={() => entscheiden(onApprove)}>
            Genehmigen
          </button>
          <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" disabled={busy} onClick={() => entscheiden(onDecline)}>
            Ablehnen
          </button>
        </div>
      </div>
    </div>
  );
}
