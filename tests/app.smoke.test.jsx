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
  await server.close();
});

async function openApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Schichtboard" });
  return user;
}

async function login(user, { code, name, password }) {
  await user.type(screen.getByPlaceholderText("z. B. 111111"), code);
  await user.type(screen.getByPlaceholderText("Vor- und Nachname"), name);
  await user.type(document.querySelector('input[type="password"]'), password);
  await user.click(screen.getByRole("button", { name: "Anmelden" }));
}

describe("Anmeldung", () => {
  test("zeigt den Login-Bildschirm", async () => {
    await openApp();
    expect(screen.getByText("Anmelden, um fortzufahren")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "+ Neue Schicht" })).toBeInTheDocument();

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
    await user.click(screen.getByRole("button", { name: "+ Neue Schicht" }));

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
    // "Offen" steht auch im Filter-Dropdown — deshalb gezielt das Badge prüfen.
    expect(within(ticket).getByText("Offen")).toHaveClass("sb-badge");
    expect(within(ticket).getByText("0 eingeschrieben")).toBeInTheDocument();
  });
});

describe("Mitarbeitende", () => {
  test("erreichen alle vier Tabs, aber keinen Admin-Bereich", async () => {
    const user = await openApp();
    await login(user, EMPLOYEE);

    expect(await screen.findByText("Mitarbeiter")).toBeInTheDocument();
    const nav = screen.getByRole("navigation");
    expect(within(nav).queryByRole("button", { name: "Mitarbeitende" })).not.toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Schichten" }));
    expect(screen.getByText(/Offene Schichten ab dem nächsten Monat/)).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Meine Schichten" }));
    expect(screen.getByText("Aktuell bist du keiner Schicht zugeteilt.")).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Konto" }));
    expect(screen.getByText("lea@firma.ch")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meine Ausbildung" })).toBeInTheDocument();
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

  test("lehnt einen bereits vergebenen Firmencode ab", async () => {
    const user = await openApp();
    await login(user, SUPER);
    await screen.findByRole("heading", { name: "Schichtboard – Verwaltung" });

    await user.click(screen.getByRole("button", { name: "+ Neues Unternehmen" }));
    await user.type(screen.getByPlaceholderText("z. B. Muster GmbH"), "Zweite Firma AG");
    await user.type(screen.getByPlaceholderText("z. B. 222222"), "111111");
    await user.type(screen.getByLabelText(/Name \(Admin\)/), "Neue Chefin");
    await user.type(screen.getByLabelText(/E-Mail \(Admin\)/), "chefin@zweite.ch");
    await user.type(screen.getByLabelText(/Passwort \(Admin\)/), "geheim");
    await user.click(screen.getByRole("button", { name: "Unternehmen anlegen" }));

    expect(await screen.findByText("Dieser Firmencode wird bereits verwendet.")).toBeInTheDocument();
  });
});
