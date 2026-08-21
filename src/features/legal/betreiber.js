/*
 * Die Angaben zum Betreiber — für Impressum und Datenschutzerklärung dieselben.
 *
 * Sie stehen bewusst an einer einzigen Stelle: Sie sind für jede Installation
 * andere und müssen vor dem ersten Einsatz ausgefüllt werden. Zweimal gepflegt
 * würden sie über kurz oder lang auseinanderlaufen, und dann stimmte eine der
 * beiden Seiten nicht mehr.
 *
 * Pflicht sind `name`, `adresse` und `kontakt`: Ein Impressum verlangt eine
 * erkennbare Identität, eine ladungsfähige Anschrift und einen Weg, den
 * Betreiber unmittelbar zu erreichen. `serverstandort` und `stand` braucht die
 * Datenschutzerklärung.
 *
 * Alles Übrige ist freiwillig und fällt weg, solange es leer bleibt:
 * `telefon` und `vertretung` (bei einer Firma die zeichnungsberechtigte
 * Person), `register` (Handelsregister- oder Unternehmensnummer, Pflicht nur
 * für eingetragene Unternehmen) und `mehrwertsteuer`.
 */
export const BETREIBER = {
  name: "[Name des Betreibers]",
  adresse: "[Strasse Nr., PLZ Ort]",
  kontakt: "[Kontaktadresse, z. B. E-Mail]",
  telefon: "",
  vertretung: "",
  register: "",
  mehrwertsteuer: "",
  serverstandort: "[Standort des Servers, z. B. Schweiz]",
  stand: "[Monat Jahr]",
};

/** Nur die ausgefüllten Zeilen — leere Angaben sollen keine Lücke hinterlassen. */
export function gefuellteZeilen(...zeilen) {
  return zeilen.filter((zeile) => zeile && zeile.trim());
}
