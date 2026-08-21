/* Die Breiten-Stufen aus src/styles.css.

   jsdom rechnet kein Layout — wie die Seite auf einem Tablet wirklich
   aussieht, sieht hier niemand. Prüfbar ist aber das, woran es bisher lag:
   dass die Stufen in der Reihenfolge stehen, in der sie sich überlagern
   dürfen, dass keine von ihnen eine Klasse anspricht, die es im Markup gar
   nicht gibt, und vor allem, dass die Rechnung aufgeht, mit der die Grenzen
   gesetzt sind. Vorher gab es eine einzige Stufe bei 640px; alles zwischen
   ihr und der vollen Breite lief ungeprüft mit. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const wurzel = path.resolve(".");
const roh = fs.readFileSync(path.join(wurzel, "src/styles.css"), "utf8");
/* Kommentare raus, bevor irgendetwas geparst wird — in ihnen stehen
   Klassennamen und Zahlen, die sonst als Regeln durchgingen. */
const css = roh.replace(/\/\*[\s\S]*?\*\//g, "");

/** Alle @media-Blöcke mit Bedingung und Inhalt, in Dateireihenfolge. */
function medienbloecke() {
  const bloecke = [];
  const anfang = /@media([^{]+)\{/g;
  let treffer;
  while ((treffer = anfang.exec(css))) {
    let tiefe = 1;
    let i = anfang.lastIndex;
    while (tiefe > 0 && i < css.length) {
      const zeichen = css[i++];
      if (zeichen === "{") tiefe++;
      else if (zeichen === "}") tiefe--;
    }
    bloecke.push({ bedingung: treffer[1].trim(), inhalt: css.slice(anfang.lastIndex, i - 1) });
  }
  return bloecke;
}

const bloecke = medienbloecke();
const basis = css.slice(0, css.indexOf("@media"));
const breitenBloecke = bloecke.filter((b) => b.bedingung.includes("max-width"));
const stufen = breitenBloecke.map((b) => Number(b.bedingung.match(/max-width:\s*(\d+)px/)[1]));

/** Ein Abschnitt CSS, zerlegt in Selektor und Deklarationen. */
function regeln(text) {
  return text
    .split("}")
    .map((teil) => {
      const klammer = teil.indexOf("{");
      if (klammer < 0) return null;
      return { selektor: teil.slice(0, klammer).trim(), dekl: teil.slice(klammer + 1) };
    })
    .filter(Boolean);
}

/** Wert einer Eigenschaft in der Regel zu genau diesem Selektor. */
function wert(text, selektor, eigenschaft) {
  const regel = regeln(text).find((r) => r.selektor === selektor);
  if (!regel) throw new Error(`keine Regel für ${selektor}`);
  const treffer = regel.dekl
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.slice(0, d.indexOf(":")).trim() === eigenschaft);
  if (!treffer) throw new Error(`${selektor} hat kein ${eigenschaft}`);
  return treffer.slice(treffer.indexOf(":") + 1).trim();
}

/** Seitliches Polster aus einer padding-Kurzschrift („0 20px 60px“). */
function seitlich(padding) {
  const teile = padding.split(/\s+/).map((t) => parseFloat(t) || 0);
  return teile.length === 1 ? teile[0] : teile[1];
}

function klassenIn(text) {
  const selektoren = regeln(text).map((r) => r.selektor).join(" ");
  return new Set([...selektoren.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

describe("Die Stufen selbst", () => {
  test("stehen absteigend, sonst überschreibt die weitere die engere", () => {
    expect(stufen.length).toBeGreaterThan(1);
    expect([...stufen].sort((a, b) => b - a)).toEqual(stufen);
    expect(new Set(stufen).size).toBe(stufen.length);
  });

  test("stehen alle in der Übersicht am Kopf des Abschnitts", () => {
    const kopf = roh.slice(roh.indexOf("Breiten-Stufen"), roh.indexOf("@media"));
    for (const px of stufen) expect(kopf).toContain(`${px}px`);
  });

  test("die Stufe für die Höhe steht zuletzt — sie gilt quer zu den anderen", () => {
    expect(bloecke.at(-1).bedingung).toContain("max-height");
  });
});

describe("Was die Stufen ansprechen", () => {
  const jsx = fs
    .readdirSync(path.join(wurzel, "src"), { recursive: true })
    .filter((d) => String(d).endsWith(".jsx"))
    .map((d) => fs.readFileSync(path.join(wurzel, "src", String(d)), "utf8"))
    .join("\n");
  const imMarkup = new Set([...jsx.matchAll(/\bsb-[\w-]+/g)].map((m) => m[0]));
  const inBasis = klassenIn(basis);

  for (const block of bloecke) {
    for (const klasse of klassenIn(block.inhalt)) {
      test(`.${klasse} (@media ${block.bedingung}) gibt es in der Basis und im Markup`, () => {
        expect(inBasis.has(klasse)).toBe(true);
        expect(imMarkup.has(klasse)).toBe(true);
      });
    }
  }
});

describe("Formularraster über alle Breiten", () => {
  /* Die Zahlen kommen aus der Datei, nicht aus dem Kopf: Wer das Polster der
     Karte ändert, verschiebt damit die Grenze — und soll es hier merken. */
  const randVoll = seitlich(wert(basis, ".sb-app", "padding"));
  const randTablet = seitlich(wert(breitenBloecke[0].inhalt, ".sb-app", "padding"));
  const randTelefon = seitlich(wert(breitenBloecke[1].inhalt, ".sb-app", "padding"));
  const kartenrand = seitlich(wert(basis, ".sb-card", "padding"));
  const rahmen = 1;
  const abstand = parseFloat(wert(basis, ".sb-form-grid", "gap"));
  const mindestspalte = parseFloat(
    wert(basis, ".sb-form-grid", "grid-template-columns").match(/minmax\((\d+)px/)[1]
  );
  /* Die längste Zeile der Anwendung: Name, Datum, Start, Ende in NewShiftForm. */
  const FELDER = 4;

  /** Lichte Breite innerhalb der Karte bei gegebener Fensterbreite. */
  const kartenbreite = (fenster, rand) => fenster - 2 * rand - 2 * kartenrand - 2 * rahmen;

  const seitenrand = (fenster) => {
    if (fenster <= stufen[1]) return randTelefon;
    if (fenster <= stufen[0]) return randTablet;
    return randVoll;
  };

  /** Wie viele Spalten das Raster bei dieser Fensterbreite bildet. */
  const spalten = (fenster) => {
    if (fenster <= stufen[2]) return 1;
    if (fenster <= stufen[0]) return 2;
    const platz = kartenbreite(fenster, randVoll);
    return Math.max(1, Math.floor((platz + abstand) / (mindestspalte + abstand)));
  };

  test("die Tablet-Stufe greift, bevor die vierte Spalte nicht mehr passt", () => {
    const noetig =
      FELDER * mindestspalte + (FELDER - 1) * abstand + 2 * (randVoll + kartenrand + rahmen);
    expect(noetig).toBe(844);
    /* Direkt über der Stufe müssen alle vier nebeneinander passen. Rutscht
       die Grenze darunter, entsteht dazwischen wieder die 3+1-Zeile mit dem
       einzelnen Feld über die ganze Kartenbreite — genau der Fehler, wegen
       dem es diese Stufe gibt. */
    expect(noetig).toBeLessThanOrEqual(stufen[0] + 1);
  });

  test("zwei feste Spalten bleiben bis zur nächsten Stufe breit genug", () => {
    const engste = stufen[2] + 1;
    const spaltenbreite = (kartenbreite(engste, seitenrand(engste)) - abstand) / 2;
    expect(spaltenbreite).toBeGreaterThanOrEqual(mindestspalte);
  });

  const GERAETE = [
    ["iPhone SE hochkant", 320],
    ["iPhone 13 mini hochkant", 375],
    ["iPhone 15 hochkant", 393],
    ["Pixel 8 hochkant", 412],
    ["Telefon quer", 667],
    ["Surface Duo", 720],
    ["iPad mini hochkant", 744],
    ["iPad 10.9 hochkant", 820],
    ["iPhone 15 Pro Max quer", 932],
    ["iPad Pro hochkant", 1024],
    ["iPad Air quer", 1180],
    ["Laptop", 1440],
    // Die Ränder der Stufen, an denen sich sonst niemand aufhält.
    ...[stufen[2], stufen[2] + 1, stufen[1], stufen[1] + 1, stufen[0], stufen[0] + 1].map((px) => [
      `Stufenrand ${px}px`,
      px,
    ]),
  ];

  test.each(GERAETE)("%s (%ipx) lässt kein Feld allein in der letzten Zeile", (_name, breite) => {
    const n = spalten(breite);
    expect(n).toBeGreaterThanOrEqual(1);
    // Ein Rest von genau 1 heisst: ein Feld über die ganze Kartenbreite.
    expect(FELDER % n).not.toBe(1);
  });

  test.each(GERAETE)("%s (%ipx) hält die Spalten breit genug", (_name, breite) => {
    const n = spalten(breite);
    const platz = kartenbreite(breite, seitenrand(breite));
    const spaltenbreite = (platz - (n - 1) * abstand) / n;
    // Einspaltig darf schmaler sein als die Mindestspalte des Rasters — dort
    // steht kein zweites Feld daneben, das noch Platz bräuchte.
    expect(spaltenbreite).toBeGreaterThan(n === 1 ? 120 : mindestspalte - 1);
  });
});
