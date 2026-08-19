/* Die Passwort-Politik für sich — Server und Formular verlassen sich beide
   auf dieselbe Funktion, also muss sie für sich allein stimmen. */

import { describe, expect, test } from "vitest";

import { passwortProblem } from "#shared/password.js";

describe("passwortProblem", () => {
  test("kürzer als 8 Zeichen fällt durch, auch mit Buchstabe und Zahl", () => {
    expect(passwortProblem("ab1")).toMatch(/8 Zeichen/);
    expect(passwortProblem("abcdef1")).toMatch(/8 Zeichen/); // genau 7
  });

  test("nur Ziffern reicht nicht — es braucht einen Buchstaben", () => {
    expect(passwortProblem("12345678")).toMatch(/Buchstaben/);
  });

  test("nur Buchstaben reicht nicht — es braucht eine Zahl oder ein Sonderzeichen", () => {
    expect(passwortProblem("abcdefgh")).toMatch(/Zahl oder ein Sonderzeichen/);
  });

  test("Buchstaben plus Zahl reichen", () => {
    expect(passwortProblem("abcdefg1")).toBeNull();
  });

  test("Buchstaben plus Sonderzeichen reichen, auch ohne Ziffer", () => {
    expect(passwortProblem("abcdefg!")).toBeNull();
  });

  test("Umlaute zählen als Buchstabe", () => {
    expect(passwortProblem("äöüßabc1")).toBeNull();
    expect(passwortProblem("äöüßäöüß")).toMatch(/Zahl oder ein Sonderzeichen/);
  });

  test("leer oder nichts übergeben fällt sauber durch, statt zu crashen", () => {
    expect(passwortProblem("")).toMatch(/8 Zeichen/);
    expect(passwortProblem(undefined)).toMatch(/8 Zeichen/);
    expect(passwortProblem(null)).toMatch(/8 Zeichen/);
  });
});
