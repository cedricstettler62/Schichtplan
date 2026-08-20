/* Die E-Mail-Prüfung für sich — Server und Formulare verlassen sich beide auf
   dieselbe Funktion, also muss sie für sich allein stimmen. */

import { describe, expect, test } from "vitest";

import { emailProblem } from "#shared/email.js";

describe("emailProblem", () => {
  test("leer oder nichts übergeben ist erlaubt — die Adresse ist überall optional", () => {
    expect(emailProblem("")).toBeNull();
    expect(emailProblem("   ")).toBeNull();
    expect(emailProblem(undefined)).toBeNull();
    expect(emailProblem(null)).toBeNull();
  });

  test("eine gültige Adresse besteht", () => {
    expect(emailProblem("lea@beispiel.ch")).toBeNull();
    expect(emailProblem("  lea@beispiel.ch  ")).toBeNull();
  });

  test("ohne @ oder ohne Domäne fällt es durch", () => {
    expect(emailProblem("leabeispiel.ch")).toMatch(/gültigen E-Mail-Adresse/);
    expect(emailProblem("lea@beispiel")).toMatch(/gültigen E-Mail-Adresse/);
    expect(emailProblem("lea@")).toMatch(/gültigen E-Mail-Adresse/);
    expect(emailProblem("@beispiel.ch")).toMatch(/gültigen E-Mail-Adresse/);
  });
});
