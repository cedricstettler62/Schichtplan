import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // API-Aufrufe gehen an den Express-Server auf Port 3000.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    // Standard ist Node — die Oberflächentests schalten per Docblock auf jsdom.
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    /* Die Oberflächentests fahren die ganze App samt Server hoch; die längsten
       brauchen allein schon drei bis vier Sekunden. Unter paralleler Last
       reichten die voreingestellten 5 s dafür gelegentlich nicht — das schlug
       als Zeitüberschreitung fehl, ohne dass etwas kaputt war.

       ACHTUNG — die 10 s sind die Notbremse, nicht der Zielwert: Wer über 5 s
       braucht, ist zu prüfen. Bisher war das immer die Suite unter Last, aber
       genauso sieht es aus, wenn ein Bereich der Anwendung tatsächlich langsam
       geworden ist — eine Schleife, die zu oft läuft, ein Nachladen, das auf
       sich warten lässt. Deshalb den betroffenen Teil ansehen, statt den Wert
       weiter hochzusetzen: Ein höheres Timeout beschleunigt nichts, es macht
       das Problem nur unsichtbar. */
    testTimeout: 10000,
  },
});
