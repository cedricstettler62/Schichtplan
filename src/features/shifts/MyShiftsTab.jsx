import MyShiftRow from "./MyShiftRow.jsx";
import TabHead from "../../components/TabHead.jsx";
import { isFutureOrToday } from "#shared/dates.js";

/*
 * Drei Listen: Was fest zugeteilt ist, was noch auf die Auslosung wartet, und
 * was schon vorbei ist. Wer bei der Auslosung leer ausgeht, verschwindet aus
 * der mittleren Liste — die Warteliste wird beim Zuteilen aufgelöst.
 *
 * Was die drei unterscheidet, steckt allein in `zeile`: Mit `onWithdraw` wartet
 * die Schicht noch, mit `onAskForHelp` ist sie zugeteilt, ohne beides liegt sie
 * hinter einem (siehe MyShiftRow).
 */
function Abschnitt({ titel, schichten, leerText, zeile }) {
  return (
    <div className="sb-tab-section">
      <h3 className="sb-subheading">{titel}</h3>
      {schichten.length === 0 ? (
        <p className="sb-empty">{leerText}</p>
      ) : (
        <div className="sb-shift-list">
          {schichten.map((s) => <MyShiftRow key={s.id} shift={s} {...zeile} />)}
        </div>
      )}
    </div>
  );
}

export default function MyShiftsTab({
  shifts, qualifications, currentUser, today, assignmentDay, onAskForHelp, onWithdraw,
}) {
  const kommend = shifts
    .filter((s) => isFutureOrToday(s.date, today))
    .sort((a, b) => a.date.localeCompare(b.date));

  const zugeteilt = kommend.filter((s) => s.assigned.includes(currentUser.id));
  const eingeschrieben = kommend.filter(
    (s) => s.enrolled.includes(currentUser.id) && !s.assigned.includes(currentUser.id)
  );
  /* Was man tatsächlich geleistet hat — sonst gibt es dafür keine Ansicht, und
     „habe ich letzten Monat gearbeitet?“ könnte niemand mehr beantworten.
     Weiter als fünf Jahre zurück steht ohnehin nichts mehr in der Datenbank. */
  const vergangen = shifts
    .filter((s) => !isFutureOrToday(s.date, today) && s.assigned.includes(currentUser.id))
    .sort((a, b) => b.date.localeCompare(a.date));

  const gemeinsam = { qualifications, currentUser };

  return (
    <div className="sb-tab">
      <TabHead titel="Meine Schichten" intro="Deine festen Zuteilungen, die Einschreibungen, über die noch entschieden wird, und was schon hinter dir liegt. Antippen für Details." />

      <Abschnitt
        titel="Zugeteilte Schichten"
        schichten={zugeteilt}
        leerText="Dir ist zurzeit keine Schicht zugeteilt."
        zeile={{ ...gemeinsam, onAskForHelp }}
      />
      <Abschnitt
        titel="Eingeschriebene Schichten"
        schichten={eingeschrieben}
        leerText="Du wartest auf keine Zuteilung."
        zeile={{ ...gemeinsam, assignmentDay, onWithdraw }}
      />
      <Abschnitt
        titel="Vergangene Schichten"
        schichten={vergangen}
        leerText="Hier steht, was du bereits geleistet hast – bisher nichts."
        zeile={gemeinsam}
      />
    </div>
  );
}
