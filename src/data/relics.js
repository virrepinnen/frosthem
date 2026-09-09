// @ts-check
/**
 * The relics, and the weapons they become.
 *
 * Kept as plain data with no imports so that everything that needs to know
 * about them can read the same list: the system that runs them, the cards that
 * offer their ranks, the window that asks which one you want, and the
 * development panel that turns them on. The Miller was added to the game
 * without appearing in the panel because that list was written out by hand in
 * two places; there is one place now.
 *
 * They are all elements of the same weather. What separates them is not what
 * they are made of but what they ask of you: the axes want you inside a pack,
 * the embers want you moving through one, the cairn wants you lined up, the
 * gale wants you to herd. A weapon that only adds a number would be a stat.
 *
 * @typedef {Object} RelicDef
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} blurb  Shown on the relic screen, when you choose
 * @property {(r:number)=>string} line  Shown on the level-up card
 */

/** @type {RelicDef[]} */
export const RELIC_DEFS = [
  {
    id: 'axes', name: 'Whirling Axes', icon: 'axe',
    blurb: 'Axes circle you and strike whatever they pass through. They reward walking into a pack.',
    line: (r) => r <= 1
      ? 'An axe circles you, striking whatever it passes through.'
      : `Faster, wider, heavier${r % 2 === 1 ? ' — and one axe more' : ''} (rank ${r}).`,
  },
  {
    id: 'javelin', name: 'Hurled Javelins', icon: 'polearm',
    blurb: 'You throw a javelin at whatever you can see, on your own. It reaches what your arm cannot.',
    line: (r) => r <= 1
      ? 'You throw a javelin at whatever you can see, on your own.'
      : `Thrown harder and more often${r >= 2 ? ', and through two' : ''} (rank ${r}).`,
  },
  {
    id: 'thunder', name: 'The Miller', icon: 'lightning',
    blurb: 'Lightning falls somewhere in the fight. It is the one that hits a crowd rather than a body.',
    line: (r) => r <= 1
      ? 'Lightning falls somewhere in the fight, and everything under it burns.'
      : `Falls more often, wider, and further out (rank ${r}).`,
  },
  {
    id: 'ember', name: 'Ember Wake', icon: 'flame',
    blurb: 'Fire. The ground burns where you have walked — so keep walking, and walk through them.',
    line: (r) => r <= 1
      ? 'You leave burning ground behind you. Anything standing in it cooks.'
      : `Burns longer, wider and hotter (rank ${r}).`,
  },
  {
    id: 'frost', name: 'Hoarfrost', icon: 'icenova',
    blurb: 'Water, stopped. A ring of cold opens out of you, and what it touches slows to a crawl.',
    line: (r) => r <= 1
      ? 'Cold opens out of you in a ring, and slows what it touches.'
      : `Opens wider, more often, and holds them longer (rank ${r}).`,
  },
  {
    id: 'cairn', name: 'Rolling Cairn', icon: 'stone',
    blurb: 'Earth. A boulder rolls away from you and ploughs through everything in its line.',
    line: (r) => r <= 1
      ? 'A boulder rolls out ahead of you, through everything in its way.'
      : `Rolls further and more often${r >= 3 ? ', two at a time' : ''} (rank ${r}).`,
  },
  {
    id: 'gale', name: 'The Gale', icon: 'whirlwind',
    blurb: 'Air. A wind wanders the field, dragging what it passes into itself and cutting it.',
    line: (r) => r <= 1
      ? 'A wandering wind drags what it passes towards its middle, and cuts.'
      : `Larger, longer-lived and hungrier (rank ${r}).`,
  },
];

/** Ids only, in order. */
export const RELIC_IDS = RELIC_DEFS.map(r => r.id);

/** @type {Map<string, RelicDef>} */
export const RELIC_BY_ID = new Map(RELIC_DEFS.map(r => [r.id, r]));
