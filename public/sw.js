/* Service Worker — macht die Seite auf dem Homescreen installierbar und den
   zuletzt gesehenen Stand offline lesbar.

   Zwei Regeln, aus denen alles Übrige folgt:

   1. Alles unter /api geht immer ans Netz. Ein Schichtplan aus dem Cache wäre
      schlimmer als gar keiner: Er sähe aus wie der aktuelle Stand, wäre es aber
      nicht, und jemand erschiene zur falschen Schicht.

   2. Seitenaufrufe fragen zuerst das Netz. Deshalb sieht nach einem Update
      jeder sofort die neue Fassung; nur wenn das Netz fehlt, kommt die zuletzt
      gespeicherte Seite. Der umgekehrte Weg würde Browser am alten Stand
      festhalten, bis der Cache irgendwann von selbst abläuft.

   Der Rest — das gebaute JavaScript, das Stylesheet, die Symbole — kommt aus
   dem Cache und wird im Hintergrund erneuert. Diese Dateien tragen ihre
   Fassung im Namen, ein alter Stand kann also gar nicht erst ausgeliefert
   werden. Genau deshalb müssen sie aber auch wieder weg: Jede neue Fassung
   heisst anders, und ohne Aufräumen sammelte sich hier mit der Zeit jedes
   Bundle, das je ausgeliefert wurde. Welche Dateien noch gebraucht werden,
   steht in der gespeicherten index.html — die ist die Wahrheit darüber, was
   zur aktuellen Fassung gehört.

   Diese Datei wird nicht gebündelt, sie liegt so im Browser, wie sie hier
   steht. */

const CACHE = "schichtboard-v1";
// Alle Adressen liefern dieselbe index.html — eine gespeicherte Kopie genügt.
const HUELLE = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(HUELLE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => caches.open(CACHE))
      .then(aufraeumen)
      .then(() => self.clients.claim())
  );
});

/**
 * Wirft aus dem Cache, was die gespeicherte Seite nicht mehr erwähnt.
 *
 * Die gebauten Dateien heissen nach ihrem Inhalt (assets/index-a1b2c3.js), eine
 * neue Fassung legt also stets neben die alte. Was die aktuelle index.html
 * nicht mehr lädt, wird auch nie wieder gebraucht.
 */
async function aufraeumen(cache) {
  const seite = await cache.match(HUELLE);
  if (!seite) return;

  const html = await seite.clone().text();
  const gebraucht = new Set([...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map((t) => t[0]));

  for (const eintrag of await cache.keys()) {
    const pfad = new URL(eintrag.url).pathname;
    if (pfad.startsWith("/assets/") && !gebraucht.has(pfad)) await cache.delete(eintrag);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Nur eigene Lesezugriffe. Schreibende Aufrufe und fremde Adressen gehen
  // unverändert durch, als gäbe es diesen Service Worker nicht.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(netzZuerst(event));
    return;
  }
  event.respondWith(ausCache(event));
});

/** Seitenaufruf: das Netz, sonst die zuletzt gespeicherte Seite. */
async function netzZuerst(event) {
  const cache = await caches.open(CACHE);
  try {
    const antwort = await fetch(event.request);
    if (antwort.ok) {
      await cache.put(HUELLE, antwort.clone());
      // Genau hier kommt eine neue Fassung an — der Moment zum Aufräumen.
      event.waitUntil(aufraeumen(cache));
    }
    return antwort;
  } catch {
    const gespeichert = await cache.match(HUELLE);
    if (gespeichert) return gespeichert;
    return new Response("Offline und noch nichts gespeichert.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/** Beiwerk: sofort aus dem Cache, Erneuerung nebenher. */
function ausCache(event) {
  return caches.open(CACHE).then(async (cache) => {
    const gespeichert = await cache.match(event.request);
    const vomNetz = fetch(event.request)
      .then((antwort) => {
        if (antwort.ok) cache.put(event.request, antwort.clone());
        return antwort;
      })
      .catch(() => null);

    // Ohne waitUntil bricht der Browser die Erneuerung ab, sobald die
    // gespeicherte Antwort zurückgegeben ist.
    if (gespeichert) {
      event.waitUntil(vomNetz);
      return gespeichert;
    }
    return (await vomNetz) || Response.error();
  });
}
