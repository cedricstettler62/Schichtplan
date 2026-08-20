import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Eine Bestätigung, die von selbst wieder verschwindet („Gespeichert.“).
 * `verbergen()` nimmt sie sofort zurück, wenn stattdessen ein Fehler dasteht.
 *
 * Der Zeitgeber wird abgeräumt, sobald die Komponente verschwindet: Sonst liefe
 * er weiter und setzte den Zustand einer Komponente, die es nicht mehr gibt.
 */
export function useKurzeMeldung(dauer = 2000) {
  const [sichtbar, setSichtbar] = useState(false);
  const uhr = useRef(null);

  useEffect(() => () => clearTimeout(uhr.current), []);

  const zeigen = useCallback(() => {
    clearTimeout(uhr.current);
    setSichtbar(true);
    uhr.current = setTimeout(() => setSichtbar(false), dauer);
  }, [dauer]);

  const verbergen = useCallback(() => {
    clearTimeout(uhr.current);
    setSichtbar(false);
  }, []);

  return [sichtbar, zeigen, verbergen];
}
