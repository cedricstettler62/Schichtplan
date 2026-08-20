import ConfirmDelete from "../../components/ConfirmDelete.jsx";

/**
 * Wartende Selbstregistrierungen — bis eine Administration hier zustimmt,
 * kann sich niemand von ihnen anmelden. Ablehnen löscht das Konto: Es hat nie
 * eine Schicht besetzt, es gibt also nichts freizugeben.
 */
export default function RegistrationsTab({ pendingAccounts, onApprove, onDecline }) {
  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Anmeldungen</h2>
          <p className="sb-tab-intro">
            Wer sich selbst ein Konto erstellt hat, steht hier, bis du zustimmst oder ablehnst.
          </p>
        </div>
      </div>

      <div className="sb-card">
        <div className="sb-manage-list">
          {pendingAccounts.length === 0 && <p className="sb-empty">Keine offenen Anmeldungen.</p>}
          {pendingAccounts.map((a) => (
            <div key={a.id} className="sb-manage-row">
              <div className="sb-pending-row">
                <span className="sb-manage-name">{a.name}</span>
                <button type="button" className="sb-btn sb-btn-petrol sb-btn-sm" onClick={() => onApprove(a.id)}>
                  Bestätigen
                </button>
                <ConfirmDelete
                  onConfirm={() => onDecline(a.id)}
                  label="Ablehnen"
                  question={`Anmeldung von ${a.name} wirklich ablehnen? Das Konto wird dabei gelöscht.`}
                  variant="button"
                  small
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
