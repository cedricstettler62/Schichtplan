/**
 * Die Anmeldung dieses Geräts.
 *
 * Angemeldet wird einmal, danach nie wieder — die Anmeldung überlebt das
 * Schliessen des Fensters und den Neustart des Rechners. Enden kann sie nur
 * auf zwei Wegen, und beide stehen hier im Text, weil sonst niemand weiss, wie
 * lange „angemeldet“ eigentlich gilt: durch diesen Knopf, oder durch eine
 * Änderung des Passworts.
 */
export default function SessionCard({ onLogout }) {
  return (
    <div className="sb-card">
      <h3 className="sb-subheading">Anmeldung</h3>
      <p className="sb-tab-intro">
        Dieses Gerät bleibt angemeldet, bis du dich hier abmeldest. Wird dein Passwort geändert,
        endet die Anmeldung überall – auch auf allen anderen Geräten. Auf einem fremden Rechner
        also besser abmelden.
      </p>
      <div className="sb-form-actions">
        <button type="button" className="sb-btn sb-btn-quiet" onClick={onLogout}>
          Auf diesem Gerät abmelden
        </button>
      </div>
    </div>
  );
}
