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
 * None of that is ever said out loud. It is carved on stones along the road,
 * muttered by two people in a village, and written on the walls of a place
 * nobody was meant to walk back out of. The player assembles it or does not.
 *
 * Three beats: something is wrong with the animals → people came here and
 * stayed → this was a burial ground, and it has been opened.
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
 * Inscriptions, by map index. Two per map, in the order they are placed along
 * the road, so the pair reads as a small scene rather than two loose facts.
 * @type {string[][]}
 */
export const RUNES = [
  [],
  [
    'Ingrid raised this for her father, who went north and did not come back.\nThe wolves would not touch him.',
    'We drove the flock south.\nThe flock would not go.',
  ],
  [
    "Cut for the jarl's hall. Twelve blocks.\nHe asked for a door that would not open from the inside.",
    'Sixth winter without a thaw. We quarry because he pays.\nHe pays in grain nobody can grow any more.',
  ],
  [
    "Toll post. All travellers north to be turned back, by order of the jarl.\n— the last line is struck through, hard enough to split the stone —",
    'Whoever reads this: the turning-back was for our sake.\nI know that now.',
  ],
  [
    'We came to take what the cold left behind.\nWe are still here. It is not so bad, once you stop shivering.',
    'Halvard has not eaten in nine days and says he is not hungry.\nNone of us are hungry.',
  ],
  [
    'Cairn raised to the old powers under the hill.\nThey were owed a gift. He gave them a promise instead.',
    'He asked the winter to spare his people.\nHe did not say for how long.',
  ],
  [
    'Here lie the ones who could still be buried.',
    'The mounds were opened from the inside.\nNote the earth: thrown outward.',
  ],
  [
    'This stair was cut for carrying the dead down.\nIt has been used for carrying them up.',
    'Do not say his name below.\nHe answers.',
  ],
  [
    'Hravn Ingesson, jarl.\nHe gave the winter a mouth, and it has not closed since.',
  ],
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
