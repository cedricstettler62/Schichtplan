import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* Der Service Worker läuft ausschliesslich im gebauten Stand.
   Im Entwicklungsbetrieb liefert sein Cache sonst alte Dateien aus, und die
   Seite liesse sich nicht mehr so testen wie bisher — `npm run dev` bleibt
   damit unverändert. Ein früher registrierter wird dort wieder entfernt,
   sonst bliebe er auf demselben Port hängen, nachdem dort einmal ein Build
   lief. */
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((registrierte) => {
      for (const r of registrierte) r.unregister();
    });
  }
}
