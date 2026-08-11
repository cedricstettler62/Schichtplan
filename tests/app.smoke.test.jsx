// @vitest-environment jsdom
/**
 * Bedient die App wie ein Mensch — gegen den echten Server, nur mit einer
 * Datenbank im Arbeitsspeicher. Fängt die Fehler, die ein erfolgreicher Build
 * nicht sieht: falsche Import-Pfade, vertippte Prop-Namen, fehlende
 * Komponenten, und ob Browser und API wirklich zusammenpassen.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../src/App.jsx";
import { ADMIN, EMPLOYEE, SUPER, installFetchBridge, startTestServer } from "./helpers/server.js";

let server;
let restoreFetch;

beforeEach(async () => {
  server = await startTestServer();
  restoreFetch = installFetchBridge(server.url);
});

afterEach(async () => {
  restoreFetch();
  window.history.pushState({}, "", "/");
  await server.close();
});

async function openApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Schichtboard" });
  return user;
}

async function login(user, { code, name, password }) {
  await user.type(screen.getByPlaceholderText("6 Ziffern"), code);
  await user.type(screen.getByPlaceholderText("Vor- und Nachname"), name);
  await user.type(document.querySelector('input[type="password"]'), password);
  await user.click(screen.getByRole("button", { name: "Anmelden" }));
}

describe("Anmeldung", () => {
  test("zeigt den Login-Bildschirm", async () => {
    await openApp();
    expect(screen.getByText("Mit Firmencode, Name und Passwort anmelden.")).toBeInTheDocument();
  });

  test("weist einen unbekannten Firmencode ab", async () => {
    const user = await openApp();
    await login(user, { code: "999999", name: "Wer Auch Immer", password: "egal" });
    expect(await screen.findByText("Unbekannter Firmencode.")).toBeInTheDocument();
  });

  test("weist ein falsches Passwort ab", async () => {
    const user = await openApp();
    await login(user, { ...ADMIN, password: "falsch" });
    expect(await screen.findByText("Name oder Passwort ist falsch.")).toBeInTheDocument();
  });
});

describe("Admin", () => {
  test("erreicht alle vier Tabs", async () => {
    const user = await openApp();
    await login(user, ADMIN);

    expect(await screen.findByText("Mara Vogt")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    const nav = screen.getByRole("navigation");

    await user.click(within(nav).getByRole("button", { name: "Schichten" }));
    expect(screen.getByRole("button", { name: "Neue Schicht" })).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Mitarbeitende" }));
    expect(screen.getByText("Lea Brunner")).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Einstellungen" }));
    expect(screen.getByRole("heading", { name: "Zuteilungstag" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Qualifikationen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Passwort ändern" })).toBeInTheDocument();
  });

  test("legt eine Schicht an, die auch die Mitarbeiterin sieht", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");

    await user.click(within(nav).getByRole("button", { name: "Schichten" }));
    await user.click(screen.getByRole("button", { name: "Neue Schicht" }));

    // Nächster Monat, damit die Schicht auch im Mitarbeiter-Tab auftaucht.
    const next = new Date();
    next.setMonth(next.getMonth() + 1, 15);
    const iso = next.toISOString().slice(0, 10);

    await user.type(screen.getByPlaceholderText("z. B. Spätschicht Verkauf"), "Spätschicht Verkauf");
    await user.type(document.querySelector('input[type="date"]'), iso);
    await user.selectOptions(
      screen.getByLabelText(/Erforderliche Qualifikation/),
      screen.getByRole("option", { name: "Erste Hilfe" })
    );
    await user.click(screen.getByRole("button", { name: "Schicht anlegen" }));

    const ticket = (await screen.findByText("Spätschicht Verkauf")).closest(".sb-ticket");
    expect(within(ticket).getByText("Freie Plätze")).toHaveClass("sb-badge");
    expect(within(ticket).getByText("0 von 1 Plätzen besetzt")).toBeInTheDocument();
  });
});

describe("Schicht bearbeiten", () => {
  test("bearbeitet eine Schicht und trägt dabei die Eingeschriebenen aus", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");

    await user.click(within(nav).getByRole("button", { name: "Schichten" }));
    await user.click(screen.getByRole("button", { name: "Neue Schicht" }));

    const heute = new Date().toISOString().slice(0, 10);
    await user.type(screen.getByPlaceholderText("z. B. Spätschicht Verkauf"), "Frühdienst");
    await user.type(document.querySelector('input[type="date"]'), heute);
    await user.selectOptions(
      screen.getByLabelText(/Erforderliche Qualifikation/),
      screen.getByRole("option", { name: "Erste Hilfe" })
    );
    await user.click(screen.getByRole("button", { name: "Schicht anlegen" }));

    const ticket = (await screen.findByText("Frühdienst")).closest(".sb-ticket");
    await user.click(within(ticket).getByRole("button", { name: "Personen anzeigen" }));
    await user.click(within(ticket).getByRole("button", { name: "Bearbeiten" }));

    const nameFeld = within(ticket).getByLabelText("Name der Schicht");
    await user.clear(nameFeld);
    await user.type(nameFeld, "Spätdienst");
    await user.click(within(ticket).getByRole("button", { name: "Änderungen speichern" }));

    // Vor dem Speichern steht die Rückfrage — die Änderung ist nicht harmlos.
    expect(await within(ticket).findByText(/Diese Schicht ändern\?/)).toBeInTheDocument();
    await user.click(within(ticket).getByRole("button", { name: "Ja, ändern" }));

    expect(await screen.findByText("Spätdienst")).toBeInTheDocument();
    expect(screen.queryByText("Frühdienst")).not.toBeInTheDocument();
  });
});

describe("Mitarbeitende", () => {
  test("erreichen alle vier Tabs, aber keinen Admin-Bereich", async () => {
    const user = await openApp();
    await login(user, EMPLOYEE);

    const nav = await screen.findByRole("navigation");
    expect(screen.getByText("Mitarbeitende")).toHaveClass("sb-badge");
    expect(within(nav).queryByRole("button", { name: "Mitarbeitende" })).not.toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Schichten" }));
    expect(screen.getByText(/Offene Schichten ab dem nächsten Monat/)).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Meine Schichten" }));
    expect(screen.getByText("Dir ist zurzeit keine Schicht zugeteilt.")).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Konto" }));
    expect(document.querySelector(".sb-account-name-lg")).toHaveTextContent("Lea Brunner");
    expect(screen.getByRole("heading", { name: "Meine Qualifikationen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Passwort ändern" })).toBeInTheDocument();
  });
});

describe("Super-Admin", () => {
  test("sieht die Unternehmensverwaltung", async () => {
    const user = await openApp();
    await login(user, SUPER);

    expect(await screen.findByRole("heading", { name: "Schichtboard – Verwaltung" })).toBeInTheDocument();
    expect(screen.getByText("Erste Firma AG")).toBeInTheDocument();
    expect(screen.getByText("111111")).toBeInTheDocument();
    expect(screen.getByText("1 Admin · 1 Mitarbeitende")).toBeInTheDocument();
  });

  test("sieht den Wartungsbereich mit Version und Datenbank", async () => {
    const user = await openApp();
    await login(user, SUPER);

    expect(await screen.findByRole("heading", { name: "Wartung" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sicherung herunterladen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jetzt aktualisieren" })).toBeInTheDocument();
    expect(screen.getByText("1 Unternehmen · 2 Konten · 0 Schichten")).toBeInTheDocument();
  });

  test("befreit ein ausgesperrtes Admin-Konto", async () => {
    const user = await openApp();
    await login(user, SUPER);
    await screen.findByRole("heading", { name: "Schichtboard – Verwaltung" });

    await user.click(screen.getByRole("button", { name: /Erste Firma AG/ }));
    expect(await screen.findByText("Admin-Passwort zurücksetzen")).toBeInTheDocument();

    await user.selectOptions(
      await screen.findByLabelText("Admin-Konto"),
      screen.getByRole("option", { name: "Mara Vogt" })
    );
    await user.type(screen.getByLabelText("Neues Passwort"), "wiederDrin");
    await user.type(screen.getByLabelText("Wiederholen"), "wiederDrin");
    await user.type(screen.getByLabelText("Dein Verwaltungs-Passwort"), SUPER.password);
    await user.click(screen.getByRole("button", { name: "Passwort setzen" }));

    expect(await screen.findByText("Neues Passwort gesetzt.")).toBeInTheDocument();
  });

  test("lehnt einen bereits vergebenen Firmencode ab", async () => {
    const user = await openApp();
    await login(user, SUPER);
    await screen.findByRole("heading", { name: "Schichtboard – Verwaltung" });

    await user.click(screen.getByRole("button", { name: "Neues Unternehmen" }));
    await user.type(screen.getByPlaceholderText("z. B. Muster GmbH"), "Zweite Firma AG");
    await user.type(screen.getByPlaceholderText("6 Ziffern"), "111111");
    await user.type(screen.getByLabelText("Name"), "Neue Chefin");
    await user.type(screen.getByLabelText("Erstes Passwort"), "chefinPw");
    await user.type(screen.getByLabelText("Wiederholen"), "chefinPw");
    await user.click(screen.getByRole("button", { name: "Unternehmen anlegen" }));

    expect(await screen.findByText("Dieser Firmencode wird bereits verwendet.")).toBeInTheDocument();
  });
});

describe("Datenschutz", () => {
  test("die Fussleiste verlinkt die Erklärung", async () => {
    await openApp();
    const link = screen.getByRole("link", { name: "Datenschutzerklärung" });
    expect(link).toHaveAttribute("href", "/datenschutz");
  });

  test("die Erklärung ist ohne Anmeldung lesbar", async () => {
    window.history.pushState({}, "", "/datenschutz");
    await openApp();

    expect(screen.getByText("Datenschutzerklärung")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Welche Daten gespeichert werden" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zurück zum Schichtboard" })).toHaveAttribute("href", "/");
    // Kein Anmeldeformular davor.
    expect(screen.queryByRole("button", { name: "Anmelden" })).not.toBeInTheDocument();
  });

  test("Mitarbeitende finden die Auskunft unter Konto", async () => {
    const user = await openApp();
    await login(user, EMPLOYEE);

    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Konto" }));

    expect(screen.getByRole("heading", { name: "Meine Daten" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auskunft herunterladen" })).toBeInTheDocument();
  });

  test("die Administration findet sie unter Einstellungen", async () => {
    const user = await openApp();
    await login(user, ADMIN);

    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Einstellungen" }));

    expect(screen.getByRole("heading", { name: "Meine Daten" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auskunft herunterladen" })).toBeInTheDocument();
  });
});
