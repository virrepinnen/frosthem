// @ts-check
/**
 * Act one: The Cold That Keeps.
 *
 * Frosthem is the last burning hearth on the northern road. Three generations
 * ago Jarl Hravn Ingesson ruled this land from a hall further north. A winter
 * came that did not end, and when his people began to die of it he went down
 * into his ancestors' barrow to ask the old powers under the hill to hold the
 * cold back.
 *
 * Something answered. The cold stopped killing him and started *keeping* him —
 * and it has been keeping everything else since. It spreads outward from the
 * barrow, and whatever it touches loses the ability to finish dying: wolves
 * that never starve, raiders who stopped feeling the frost and stayed, the
 * drowned walking up out of the tarns. He asked winter to spare his people. He
 * never said for how long.
 *
 * None of that is ever said out loud. It lives in the names of the places, in
 * what two people in a village will admit to, and in what Hravn himself says
 * when he finally moves. The player assembles it or does not.
 *
 * The readable stones that used to carry the thread are gone: there were far
 * too many of them, and a world that explains itself at every turn has no
 * mystery left. Whatever replaces them comes after the combat feels right.
 */

/** The line that fades in under the banner when you arrive, per map index. */
export const ZONE_LINE = [
  'The last hearth on the northern road.',
  'The crofts out here were left standing. Nobody bothered to burn them.',
  'They were cutting stone. Something stopped them with the blocks still on the sledges.',
  'The road climbs. The wind has teeth this high.',
  'Tents still pitched, fires long out. Nobody broke camp.',
  'Above the treeline. From here you can see how far the white goes.',
  'Mounds in rows — more than a village this size ever had people.',
  'The ground opens. Steps, cut long before anyone here was born.',
  'It is warm down here. That is the worst of it.',
];

/**
 * What the two villagers say, and how it changes as you get further north.
 * The first entry whose `after` you have passed wins, so the lines are ordered
 * deepest-first.
 * @type {Record<string, {after:number, line:string}[]>}
 */
export const NPC_LINES = {
  gerd: [
    { after: 8, line: 'You went into the barrow and came back out. Sit down before you fall down.' },
    { after: 5, line: 'My mother traded with the jarl’s household. Nobody in this village says his name.' },
    { after: 2, line: 'You have been north. I can tell — you have that look, like the cold is still deciding about you.' },
    { after: 0, line: 'Buy, sell, or leave me be. The snow does not care.' },
  ],
  olav: [
    { after: 8, line: 'So it is done. The wind sounds different tonight — or I am old and hopeful.' },
    { after: 6, line: 'Rows of mounds, you say. For a village of forty. Count them again and tell me I am wrong.' },
    { after: 3, line: 'The quarry cut stone for a door. Ask yourself what kind of door needs twelve blocks.' },
    { after: 1, line: 'Hravn does not lie still in his grave. Someone has to go there.' },
  ],
};

/** Hravn, when he wakes and when he falls. */
export const HRAVN = {
  wake: 'Three generations I have kept them. Not one has thanked me.',
  fall: 'The cold in the barrow lets go. Whatever was keeping him has nothing left to keep.',
};

/**
 * @param {string} id @param {number} depth Deepest map index reached
 */
export function npcLine(id, depth) {
  const set = NPC_LINES[id];
  if (!set) return '';
  return (set.find(l => depth >= l.after) ?? set[set.length - 1]).line;
}
