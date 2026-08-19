// @vitest-environment jsdom
/**
 * Bedient die App wie ein Mensch — gegen den echten Server, nur mit einer
 * Datenbank im Arbeitsspeicher. Fängt die Fehler, die ein erfolgreicher Build
 * nicht sieht: falsche Import-Pfade, vertippte Prop-Namen, fehlende
 * Komponenten, und ob Browser und API wirklich zusammenpassen.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

describe("App einrichten und abmelden", () => {
  /* Beide Karten stehen unten in den Einstellungen und im Konto — sie gehören
     jedem Konto, nicht nur der Administration. */

  const einstellungenOeffnen = async (user, tab) => {
    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: tab }));
  };

  test("die Administration findet beide Karten unter Einstellungen", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    await einstellungenOeffnen(user, "Einstellungen");

    expect(screen.getByRole("heading", { name: "Als Programm einrichten" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anmeldung" })).toBeInTheDocument();
  });

  test("Mitarbeitende finden sie unter Konto", async () => {
    const user = await openApp();
    await login(user, EMPLOYEE);
    await einstellungenOeffnen(user, "Konto");

    expect(screen.getByRole("heading", { name: "Als Programm einrichten" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anmeldung" })).toBeInTheDocument();
  });

  test("der Knopf dort meldet ab", async () => {
    const user = await openApp();
    await login(user, EMPLOYEE);
    await einstellungenOeffnen(user, "Konto");

    await user.click(screen.getByRole("button", { name: "Auf diesem Gerät abmelden" }));
    await screen.findByText("Mit Firmencode, Name und Passwort anmelden.");
  });

  test("die Kalenderabo-Karte steht bei Administration und Mitarbeitenden", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    await einstellungenOeffnen(user, "Einstellungen");
    expect(await screen.findByRole("heading", { name: "Kalenderabo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Auf diesem Gerät abmelden" }));
    await screen.findByText("Mit Firmencode, Name und Passwort anmelden.");
    await login(user, EMPLOYEE);
    await einstellungenOeffnen(user, "Konto");
    expect(await screen.findByRole("heading", { name: "Kalenderabo" })).toBeInTheDocument();
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
    await user.click(within(ticket).getByRole("button", { name: "Ja, speichern" }));

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

describe("Meldungen statt Stille", () => {
  test("ein abgelehntes Formular bleibt stehen und sagt warum", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Schichten" }));
    await user.click(screen.getByRole("button", { name: "Neue Schicht" }));

    await user.type(screen.getByPlaceholderText("z. B. Spätschicht Verkauf"), "Rückwirkend");
    await user.type(screen.getByLabelText("Datum"), "2020-01-06");
    await user.selectOptions(
      screen.getByLabelText(/Erforderliche Qualifikation/),
      screen.getByRole("option", { name: "Erste Hilfe" })
    );
    await user.click(screen.getByRole("button", { name: "Schicht anlegen" }));

    /* Vorher schloss sich das Formular auch bei einem Fehler, leerte alle
       Felder und meldete nichts — die Schicht war einfach nicht da. */
    expect(await screen.findByText(/nicht in der Vergangenheit anlegen/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("z. B. Spätschicht Verkauf")).toHaveValue("Rückwirkend");
  });

  test("ohne Uhrzeit kommt eine Ansage statt einer 24-Stunden-Schicht", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Schichten" }));
    await user.click(screen.getByRole("button", { name: "Neue Schicht" }));

    await user.type(screen.getByPlaceholderText("z. B. Spätschicht Verkauf"), "Ohne Zeit");
    await user.type(screen.getByLabelText("Datum"), new Date().toISOString().slice(0, 10));
    await user.clear(screen.getByLabelText("Endzeit"));
    await user.selectOptions(
      screen.getByLabelText(/Erforderliche Qualifikation/),
      screen.getByRole("option", { name: "Erste Hilfe" })
    );
    await user.click(screen.getByRole("button", { name: "Schicht anlegen" }));

    expect(await screen.findByText("Bitte Start- und Endzeit angeben.")).toBeInTheDocument();
    expect(screen.queryByText("Ohne Zeit")).not.toBeInTheDocument();
  });
});

describe("Eigene Qualifikationen", () => {
  test("die Administration setzt ihre eigenen unter Einstellungen", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Einstellungen" }));

    /* Ohne diesen Abschnitt käme ein Admin an keine Qualifikation: Die
       Mitarbeitendenliste führt nur Mitarbeitendenkonten. */
    const karte = (await screen.findByRole("heading", { name: "Meine Qualifikationen" })).closest(".sb-card");
    const schalter = () => within(karte).getByRole("button", { name: "Nachtschicht" });
    expect(schalter()).toHaveAttribute("aria-pressed", "false");

    await user.click(schalter());
    await waitFor(() => expect(schalter()).toHaveAttribute("aria-pressed", "true"));

    // Und sie bleibt gesetzt, nicht nur im Formular.
    await user.click(within(nav).getByRole("button", { name: "Übersicht" }));
    await user.click(within(nav).getByRole("button", { name: "Einstellungen" }));
    const wieder = (await screen.findByRole("heading", { name: "Meine Qualifikationen" })).closest(".sb-card");
    expect(within(wieder).getByRole("button", { name: "Nachtschicht" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Adminrechte abgeben", () => {
  test("nur die eigenen, und nicht als letzte Administration", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    let nav = await screen.findByRole("navigation");

    // Als einzige Administration geht es nicht.
    await user.click(within(nav).getByRole("button", { name: "Einstellungen" }));
    expect(await screen.findByText(/einzige Administration – befördere zuerst jemanden/)).toBeInTheDocument();

    // Lea befördern, dann kann Mara abgeben.
    await user.click(within(nav).getByRole("button", { name: "Mitarbeitende" }));
    await user.click(screen.getByRole("button", { name: /Lea Brunner/ }));
    await user.click(await screen.findByRole("button", { name: "Zum Admin befördern" }));
    await user.click(await screen.findByRole("button", { name: "Ja, befördern" }));

    await user.click(within(nav).getByRole("button", { name: "Einstellungen" }));
    await user.click(await screen.findByRole("button", { name: "Adminrechte abgeben" }));
    await user.click(await screen.findByRole("button", { name: "Ja, abgeben" }));

    /* Die Tabs richten sich nach der Rolle — der aktive verschwindet dabei und
       fällt auf die Übersicht zurück, statt eine leere Seite zu hinterlassen. */
    nav = await screen.findByRole("navigation");
    await waitFor(() =>
      expect(within(nav).queryByRole("button", { name: "Einstellungen" })).not.toBeInTheDocument()
    );
    expect(within(nav).getByRole("button", { name: "Konto" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Übersicht" })).toBeInTheDocument();
  });
});

describe("Wer befördert wird, behält seine Schichten", () => {
  test("Meine Schichten bleibt erreichbar, auch als Admin", async () => {
    // Eine vergangene und eine kommende Zuteilung für Lea, direkt in der Datenbank.
    const leaId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Lea Brunner'").get().id;
    const companyId = server.db.prepare("SELECT id FROM companies").get().id;
    const qualId = server.db.prepare("SELECT id FROM qualifications WHERE company_id = ?").get(companyId).id;

    const anlegen = (id, datum) => {
      server.db.prepare(
        `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                             repeat, seats, qualification_id, end_date, assignment_attempted, assigned_at)
         VALUES (?, ?, ?, ?, ?, '08:00', '16:00', 'once', 1, ?, NULL, 1, ?)`
      ).run(id, companyId, `serie_${id}`, id === "s_alt" ? "Alter Dienst" : "Neuer Dienst", datum, qualId, datum);
      server.db.prepare("INSERT INTO enrollments (shift_id, account_id, assigned) VALUES (?, ?, 1)").run(id, leaId);
    };
    const tage = (n) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    anlegen("s_alt", tage(-30));
    anlegen("s_neu", tage(20));

    const user = await openApp();
    await login(user, ADMIN);
    let nav = await screen.findByRole("navigation");

    // Lea befördern.
    await user.click(within(nav).getByRole("button", { name: "Mitarbeitende" }));
    await user.click(screen.getByRole("button", { name: /Lea Brunner/ }));
    await user.click(await screen.findByRole("button", { name: "Zum Admin befördern" }));
    await user.click(await screen.findByRole("button", { name: "Ja, befördern" }));

    await user.click(screen.getByRole("button", { name: "Abmelden" }));
    await screen.findByText("Mit Firmencode, Name und Passwort anmelden.");
    await login(user, EMPLOYEE);

    /* Die Beförderung nimmt niemandem die Schichten weg — vorher aber die Sicht
       darauf: Der Tab hing allein an der Rolle. */
    nav = await screen.findByRole("navigation");
    expect(await within(nav).findByRole("button", { name: "Meine Schichten" })).toBeInTheDocument();
    await user.click(within(nav).getByRole("button", { name: "Meine Schichten" }));
    expect(await screen.findByText("Neuer Dienst")).toBeInTheDocument();
    // Und was schon hinter ihr liegt, steht ebenfalls da.
    expect(screen.getByText("Alter Dienst")).toBeInTheDocument();
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
    // Aufklappen zeigt zuerst nur die Übersicht mit dem Auswahl-Menü — der
    // gewünschte Bereich muss gezielt angewählt werden.
    await user.click(screen.getByRole("button", { name: "Admin-Passwort zurücksetzen" }));

    // Auf das eigene Auswahlfeld eingrenzen: Der Löschabschnitt führt dieselben
    // Konten noch einmal auf.
    const auswahl = await screen.findByLabelText("Admin-Konto");
    await user.selectOptions(auswahl, within(auswahl).getByRole("option", { name: "Mara Vogt" }));
    await user.type(screen.getByLabelText("Neues Passwort"), "wiederDrin");
    await user.type(screen.getByLabelText("Wiederholen"), "wiederDrin");
    await user.type(screen.getByLabelText("Dein Verwaltungs-Passwort"), SUPER.password);
    await user.click(screen.getByRole("button", { name: "Passwort setzen" }));

    expect(await screen.findByText("Neues Passwort gesetzt.")).toBeInTheDocument();
  });

  test("löscht das letzte Admin-Konto nur mit Nachfolge", async () => {
    const user = await openApp();
    await login(user, SUPER);
    await screen.findByRole("heading", { name: "Schichtboard – Verwaltung" });

    await user.click(screen.getByRole("button", { name: /Erste Firma AG/ }));
    await user.click(screen.getByRole("button", { name: "Admin-Konto löschen" }));
    expect(await screen.findByLabelText("Nachfolge")).toBeInTheDocument();

    /* Mara ist die einzige Administration — ohne Nachfolge stünde die Firma
       ohne da, also fragt das Formular danach. */
    expect(screen.getByText(/Das ist die letzte Administration/)).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Nachfolge"),
      screen.getByRole("option", { name: "Lea Brunner" })
    );
    await user.type(screen.getByLabelText("Verwaltungs-Passwort zur Bestätigung"), SUPER.password);
    await user.click(screen.getByRole("button", { name: "Jetzt löschen" }));
    await user.click(await screen.findByRole("button", { name: "Ja, löschen" }));

    expect(await screen.findByText(/Mara Vogt wurde gelöscht/)).toBeInTheDocument();
    expect(await screen.findByText("1 Admin · 0 Mitarbeitende")).toBeInTheDocument();

    // Lea führt die Firma jetzt.
    await user.click(screen.getByRole("button", { name: "Abmelden" }));
    await screen.findByText("Mit Firmencode, Name und Passwort anmelden.");
    await login(user, EMPLOYEE);
    expect(await screen.findByText("Admin")).toHaveClass("sb-badge");
  });

  test("pausiert, archiviert und stellt ein Unternehmen wieder her", async () => {
    const user = await openApp();
    await login(user, SUPER);
    await screen.findByRole("heading", { name: "Schichtboard – Verwaltung" });

    await user.click(screen.getByRole("button", { name: /Erste Firma AG/ }));
    await user.click(screen.getByRole("button", { name: "Pausieren" }));
    expect(await screen.findByText("· pausiert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fortsetzen" }));
    // Wartet auf den zurückgeflippten Knopf, statt sofort auf das Verschwinden
    // des Hinweises zu prüfen — die Antwort vom Server braucht einen Moment.
    await screen.findByRole("button", { name: "Pausieren" });
    expect(screen.queryByText("· pausiert")).not.toBeInTheDocument();

    // Löschen sperrt den Zugang sofort und verschiebt die Firma ins Archiv.
    await user.click(screen.getByRole("button", { name: "Unternehmen löschen" }));
    await user.click(await screen.findByRole("button", { name: "Ja, löschen" }));
    await waitFor(() => expect(screen.queryByText("Erste Firma AG")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Archiviert/ }));
    expect(await screen.findByText("Erste Firma AG")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Erste Firma AG/ }));
    await user.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    expect(await screen.findByText("Kein archiviertes Unternehmen.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unternehmen" }));
    expect(await screen.findByText("Erste Firma AG")).toBeInTheDocument();
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

describe("Überschneidungen", () => {
  /** Weit genug voraus, dass noch nichts zugeteilt wird und beide Schichten stehen bleiben. */
  const spaeter = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2, 15);
    return d.toISOString().slice(0, 10);
  };

  const formularFuellen = async (user, { name, von, bis }) => {
    await user.type(screen.getByPlaceholderText("z. B. Spätschicht Verkauf"), name);
    await user.type(screen.getByLabelText("Datum"), spaeter());
    await user.clear(screen.getByLabelText("Startzeit"));
    await user.type(screen.getByLabelText("Startzeit"), von);
    await user.clear(screen.getByLabelText("Endzeit"));
    await user.type(screen.getByLabelText("Endzeit"), bis);
    await user.selectOptions(
      screen.getByLabelText(/Erforderliche Qualifikation/),
      screen.getByRole("option", { name: "Erste Hilfe" })
    );
  };

  const schichtAnlegen = async (user, daten) => {
    await user.click(screen.getByRole("button", { name: "Neue Schicht" }));
    await formularFuellen(user, daten);
    await user.click(screen.getByRole("button", { name: "Schicht anlegen" }));
    await screen.findByText(daten.name);
  };

  test("das Formular meldet eine Überschneidung erst, wenn es eine gibt", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Schichten" }));

    await schichtAnlegen(user, { name: "Frühdienst", von: "08:00", bis: "16:00" });

    // Anschliessende Zeit: kein Konflikt, also auch keine Rückfrage.
    await user.click(screen.getByRole("button", { name: "Neue Schicht" }));
    await formularFuellen(user, { name: "Spätdienst", von: "16:00", bis: "22:00" });
    expect(screen.queryByText("Überschneidungen")).not.toBeInTheDocument();

    // Überlappende Zeit: jetzt muss entschieden werden.
    await user.clear(screen.getByLabelText("Startzeit"));
    await user.type(screen.getByLabelText("Startzeit"), "14:00");

    expect(await screen.findByText("Überschneidungen")).toBeInTheDocument();
    const block = screen.getByText("Überschneidungen").closest(".sb-overlap");
    expect(within(block).getByText("Frühdienst")).toBeInTheDocument();
    expect(within(block).getByLabelText("Zusammen übernehmbar?")).toHaveValue("nein");
  });

  test("ohne Freigabe nennt die Fehlermeldung beide Schichten", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Schichten" }));

    await schichtAnlegen(user, { name: "Frühdienst", von: "08:00", bis: "16:00" });
    await schichtAnlegen(user, { name: "Tagdienst", von: "14:00", bis: "22:00" });

    await user.click(screen.getByRole("button", { name: "Abmelden" }));
    await screen.findByText("Mit Firmencode, Name und Passwort anmelden.");
    await login(user, EMPLOYEE);
    const navLea = await screen.findByRole("navigation");
    await user.click(within(navLea).getByRole("button", { name: "Schichten" }));

    const frueh = (await screen.findByText("Frühdienst")).closest(".sb-ticket");
    await user.click(within(frueh).getByRole("button", { name: "Einschreiben" }));

    const tag = (await screen.findByText("Tagdienst")).closest(".sb-ticket");
    await user.click(within(tag).getByRole("button", { name: "Einschreiben" }));

    const meldung = await screen.findByText(/lassen sich nicht gleichzeitig übernehmen/);
    expect(meldung).toHaveTextContent("Frühdienst");
    expect(meldung).toHaveTextContent("Tagdienst");
  });
  test("beim Bearbeiten lässt sich eine Überschneidung nachträglich freigeben", async () => {
    const user = await openApp();
    await login(user, ADMIN);
    const nav = await screen.findByRole("navigation");
    await user.click(within(nav).getByRole("button", { name: "Schichten" }));

    await schichtAnlegen(user, { name: "Frühdienst", von: "08:00", bis: "16:00" });
    await schichtAnlegen(user, { name: "Tagdienst", von: "14:00", bis: "22:00" });

    const ticket = (await screen.findByText("Tagdienst")).closest(".sb-ticket");
    await user.click(within(ticket).getByRole("button", { name: "Personen anzeigen" }));
    await user.click(within(ticket).getByRole("button", { name: "Bearbeiten" }));

    // Die bestehende Überschneidung steht da, mit ihrem jetzigen Stand.
    const block = within(ticket).getByText("Überschneidungen").closest(".sb-overlap");
    expect(within(block).getByText("Frühdienst")).toBeInTheDocument();
    const wahl = within(block).getByLabelText("Zusammen übernehmbar?");
    expect(wahl).toHaveValue("nein");

    await user.selectOptions(wahl, "ja");
    await user.click(within(ticket).getByRole("button", { name: "Änderungen speichern" }));

    // Ohne Änderung an der Schicht wird auch niemand ausgetragen.
    expect(await within(ticket).findByText(/nur die Freigaben werden gespeichert/)).toBeInTheDocument();
    await user.click(within(ticket).getByRole("button", { name: "Ja, speichern" }));

    await user.click(screen.getByRole("button", { name: "Abmelden" }));
    await screen.findByText("Mit Firmencode, Name und Passwort anmelden.");
    await login(user, EMPLOYEE);
    const navLea = await screen.findByRole("navigation");
    await user.click(within(navLea).getByRole("button", { name: "Schichten" }));

    const frueh = (await screen.findByText("Frühdienst")).closest(".sb-ticket");
    await user.click(within(frueh).getByRole("button", { name: "Einschreiben" }));
    const tag = (await screen.findByText("Tagdienst")).closest(".sb-ticket");
    await user.click(within(tag).getByRole("button", { name: "Einschreiben" }));

    // Freigegeben, also geht beides — und keine Fehlermeldung dazwischen.
    expect(await within(tag).findByText("Austragen")).toBeInTheDocument();
    expect(screen.queryByText(/lassen sich nicht gleichzeitig übernehmen/)).not.toBeInTheDocument();
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
