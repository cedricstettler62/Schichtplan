/* Erzeugt die Symbole der App aus einer einzigen Beschreibung: dunkler Grund,
   darauf drei versetzte Balken — die Zeilen eines Schichtplans.

       node scripts/icons.js

   Die erzeugten Dateien liegen im Repo, dieses Skript muss also nur laufen,
   wenn sich das Aussehen ändern soll. Die Farben sind dieselben Literalwerte
   wie in src/styles.css; ändert sich dort die Palette, gehört sie hier mit
   geändert.

   Kein Bildpaket als Abhängigkeit: PNG ist ein Kopf, ein Deflate-Block und
   eine Prüfsumme, und alles drei kann Node von sich aus. */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const INK = [0x1e, 0x2a, 0x38];
const AMBER = [0xe2, 0xa3, 0x3b];
const PETROL = [0x3f, 0x7c, 0x74];
const RUST = [0xc1, 0x54, 0x3c];

/* --- Zeichnen --- */

const canvas = (size) => ({ size, px: new Float64Array(size * size * 4) });

/** Deckung eines Pixels durch ein abgerundetes Rechteck — der Abstand zum Rand
 *  ergibt einen weichen Übergang, sonst wären die Rundungen treppig. */
function coverage(px, py, { x, y, w, h, r }) {
  const dx = Math.max(Math.abs(px - (x + w / 2)) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(py - (y + h / 2)) - (h / 2 - r), 0);
  return Math.min(Math.max(0.5 - (Math.hypot(dx, dy) - r), 0), 1);
}

/** Legt eine Farbe über das bereits Gezeichnete ("source over"). */
function fill(c, rect, [r, g, b]) {
  const von = { x: Math.max(0, Math.floor(rect.x - 1)), y: Math.max(0, Math.floor(rect.y - 1)) };
  const bis = {
    x: Math.min(c.size, Math.ceil(rect.x + rect.w + 1)),
    y: Math.min(c.size, Math.ceil(rect.y + rect.h + 1)),
  };
  for (let y = von.y; y < bis.y; y++) {
    for (let x = von.x; x < bis.x; x++) {
      const a = coverage(x + 0.5, y + 0.5, rect);
      if (a === 0) continue;
      const i = (y * c.size + x) * 4;
      const da = c.px[i + 3];
      const oa = a + da * (1 - a);
      c.px[i] = (r * a + c.px[i] * da * (1 - a)) / oa;
      c.px[i + 1] = (g * a + c.px[i + 1] * da * (1 - a)) / oa;
      c.px[i + 2] = (b * a + c.px[i + 2] * da * (1 - a)) / oa;
      c.px[i + 3] = oa;
    }
  }
}

/** Skaliert ein Rechteck (Anteile der Kantenlänge) um die Bildmitte. */
const umMitte = (r, s) => ({
  x: 0.5 + (r.x - 0.5) * s,
  y: 0.5 + (r.y - 0.5) * s,
  w: r.w * s,
  h: r.h * s,
});

/**
 * `randlos` füllt bis an die Kante — nötig für maskierbare Symbole und für
 * iOS, wo das System selbst rundet und ein zweiter Rand doppelt aussähe.
 * `inhalt` schrumpft die Balken in die Schutzzone maskierbarer Symbole.
 */
function zeichne(size, { randlos = false, inhalt = 1 } = {}) {
  const c = canvas(size);
  const u = (v) => v * size;

  fill(c, { x: 0, y: 0, w: size, h: size, r: randlos ? 0 : u(0.22) }, INK);

  const balken = [
    { x: 0.2, w: 0.52, farbe: AMBER },
    { x: 0.3, w: 0.5, farbe: PETROL },
    { x: 0.2, w: 0.36, farbe: RUST },
  ];
  const hoehe = 0.105;
  const luft = 0.075;
  let y = 0.5 - (balken.length * hoehe + (balken.length - 1) * luft) / 2;

  for (const b of balken) {
    const r = umMitte({ x: b.x, y, w: b.w, h: hoehe }, inhalt);
    fill(c, { x: u(r.x), y: u(r.y), w: u(r.w), h: u(r.h), r: u(r.h / 2) }, b.farbe);
    y += hoehe + luft;
  }
  return c;
}

/* --- PNG schreiben --- */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(data.length);
  const koerper = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(koerper));
  return Buffer.concat([laenge, koerper, pruef]);
}

function png(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.size, 0);
  ihdr.writeUInt32BE(c.size, 4);
  ihdr[8] = 8; // 8 Bit je Kanal
  ihdr[9] = 6; // RGBA
  // Jede Zeile beginnt mit ihrem Filterbyte — 0 heisst "unverändert".
  const roh = Buffer.alloc(c.size * (1 + c.size * 4));
  for (let y = 0; y < c.size; y++) {
    const zeile = y * (1 + c.size * 4);
    for (let i = 0; i < c.size * 4; i++) {
      roh[zeile + 1 + i] = Math.round(c.px[y * c.size * 4 + i] * (i % 4 === 3 ? 255 : 1));
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(roh, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --- Ausgabe --- */

const zu = (name) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", name);

const dateien = [
  ["icon-192.png", zeichne(192)],
  ["icon-512.png", zeichne(512)],
  // Maskierbar: Android schneidet eine beliebige Form heraus, deshalb Grund bis
  // an die Kante und der Inhalt weit genug innen.
  ["icon-maskable-512.png", zeichne(512, { randlos: true, inhalt: 0.66 })],
  ["apple-touch-icon.png", zeichne(180, { randlos: true })],
  ["favicon-32.png", zeichne(32)],
];

fs.mkdirSync(zu("."), { recursive: true });
for (const [name, bild] of dateien) {
  fs.writeFileSync(zu(name), png(bild));
  console.log(`${name} — ${bild.size}×${bild.size}`);
}
