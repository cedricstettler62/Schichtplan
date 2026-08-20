/** Kopfzeile eines Tabs: Titel und Einleitung links, die Hauptaktion — wo es
    eine gibt — rechts auf derselben Höhe. Jeder Tab beginnt damit. */
export default function TabHead({ titel, intro, children }) {
  return (
    <div className="sb-tab-head">
      <div className="sb-tab-head-text">
        <h2 className="sb-tab-head-title">{titel}</h2>
        <p className="sb-tab-intro">{intro}</p>
      </div>
      {children}
    </div>
  );
}

/** Klappt ein Anlegen-Formular auf und zu. Offen heisst er „Abbrechen“ und tritt
    zurück — sonst stünden zwei gleich betonte Knöpfe nebeneinander. */
export function NeuKnopf({ offen, onClick, label }) {
  return (
    <button type="button" className={`sb-btn ${offen ? "sb-btn-quiet" : "sb-btn-amber"}`} onClick={onClick}>
      {offen ? "Abbrechen" : label}
    </button>
  );
}
