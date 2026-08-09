/* Kurze, gut lesbare IDs. Kollisionen sind bei dieser Datenmenge kein Thema,
   trotzdem hängt ein Zufallsanteil dran. */

let counter = 0;

export function uid(prefix) {
  counter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${time}${counter.toString(36)}${rand}`;
}
