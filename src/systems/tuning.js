// @ts-check
/**
 * The feel knobs.
 *
 * Every number that decides how the game *feels* — as opposed to how it is
 * balanced — lives here instead of being spelled into the system that uses it.
 * The point is not tidiness: it is that feel can only be judged by playing, and
 * a number you can drag while you play converges in one sitting where a number
 * that has to travel through a conversation takes four.
 *
 * Balance numbers stay where they are, in `src/data/`. The line between them is
 * simple: if changing it makes the game *harder*, it is balance; if changing it
 * makes the game *nicer to control*, it is here.
 *
 * Values are saved per browser so they survive a reload, and `F3` opens the
 * panel that edits them.
 */

const KEY = 'frosthem.tuning.v1';

/**
 * @typedef {Object} Knob
 * @property {string} id
 * @property {string} group
 * @property {string} label
 * @property {number} min
 * @property {number} max
 * @property {number} step
 * @property {string} [unit]
 * @property {string} [note] One line on what it changes, shown in the panel
 */

/** @type {Knob[]} */
export const KNOBS = [
  { id: 'viewWidth', group: 'Camera', label: 'View width', min: 700, max: 1600, step: 25,
    unit: 'wu', note: 'World units across the screen. Higher = further out.' },

  { id: 'moveSpeed', group: 'You', label: 'Walk speed', min: 100, max: 300, step: 5, unit: 'px/s' },
  { id: 'attackRate', group: 'You', label: 'Swing rate', min: 0.4, max: 3, step: 0.05, unit: '×',
    note: 'How fast the basic attack repeats.' },
  { id: 'potionHeal', group: 'You', label: 'Potion strength', min: 0.2, max: 2, step: 0.05, unit: '×' },
  { id: 'reach', group: 'You', label: 'Swing reach', min: 40, max: 160, step: 2, unit: 'px' },
  { id: 'swingStep', group: 'You', label: 'Step into the swing', min: 0, max: 90, step: 2, unit: 'px',
    note: 'How far the basic attack carries you forward. 0 turns it off.' },
  { id: 'rollDist', group: 'You', label: 'Roll distance', min: 80, max: 500, step: 5, unit: 'px',
    note: 'Actual pixels travelled, deceleration included.' },
  { id: 'rollTime', group: 'You', label: 'Roll duration', min: 0.14, max: 0.5, step: 0.02, unit: 's' },
  { id: 'rollCd', group: 'You', label: 'Roll cooldown', min: 0, max: 2.5, step: 0.05, unit: 's' },
  { id: 'rollIframes', group: 'You', label: 'Roll invulnerable window', min: 0, max: 1, step: 0.05,
    note: 'Share of the roll you cannot be hit during.' },

  { id: 'rangedWindup', group: 'Monsters', label: 'Ranged draw', min: 0.15, max: 1.6, step: 0.05, unit: 's',
    note: 'How long an archer aims before the shot. The aim locks when it starts.' },
  { id: 'monHp', group: 'Monsters', label: 'Health', min: 0.2, max: 4, step: 0.1, unit: '×',
    note: 'Takes effect on maps you enter after changing it.' },
  { id: 'monCd', group: 'Monsters', label: 'Attack rate', min: 0.3, max: 3, step: 0.05, unit: '×',
    note: 'How often a monster touching you can hurt you, and how often archers shoot.' },
  { id: 'contactPad', group: 'Monsters', label: 'Contact slack', min: -12, max: 40, step: 1, unit: 'px',
    note: 'How close counts as touching. Lower is more forgiving of a near miss.' },
  { id: 'projSpeed', group: 'Monsters', label: 'Arrow speed', min: 180, max: 900, step: 10, unit: 'px/s' },
  { id: 'lungeSpeed', group: 'Monsters', label: 'Charge speed', min: 1, max: 5, step: 0.1, unit: '×' },
  { id: 'packSize', group: 'Monsters', label: 'Pack size', min: 0.2, max: 3, step: 0.1, unit: '×',
    note: 'Takes effect on maps you enter after changing it.' },
  { id: 'eliteRate', group: 'Monsters', label: 'Elite packs', min: 0, max: 4, step: 0.5, unit: '×',
    note: 'On top of the one at the detour. Takes effect on new maps.' },
  { id: 'dmgMult', group: 'Monsters', label: 'Damage', min: 0.3, max: 3.5, step: 0.1, unit: '×',
    note: 'Multiplies everything they hit you for.' },
  { id: 'monSpeed', group: 'Monsters', label: 'Speed', min: 0.5, max: 2, step: 0.05, unit: '×' },
  { id: 'aggro', group: 'Monsters', label: 'Aggro range', min: 200, max: 900, step: 20, unit: 'px' },

  // Every relic gets its own section rather than one long list: two knobs
  // each was readable, five each was a wall. `Rate` divides the wait between
  // uses; for the four animals that wait is a fixed ten seconds.
  { id: 'autoDmg', group: 'Relics', label: 'All damage', min: 0, max: 3, step: 0.05, unit: '×',
    note: 'Every automatic weapon at once.' },
  { id: 'autoRate', group: 'Relics', label: 'All rate', min: 0.3, max: 3, step: 0.05, unit: '×' },

  { id: 'axesDmg', group: 'Axes', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'axesRate', group: 'Axes', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'axeRadius', group: 'Axes', label: 'Ring radius', min: 30, max: 180, step: 2, unit: 'px' },
  { id: 'axesReach', group: 'Axes', label: 'Bite', min: 10, max: 80, step: 1, unit: 'px',
    note: 'How close an axe has to pass.' },

  { id: 'javDmg', group: 'Javelins', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'javRate', group: 'Javelins', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'javSpeed', group: 'Javelins', label: 'Flight speed', min: 200, max: 1100, step: 20, unit: 'px/s' },

  { id: 'boltDmg', group: 'Miller', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'boltRate', group: 'Miller', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'boltSize', group: 'Miller', label: 'Strike radius', min: 20, max: 220, step: 4, unit: 'px' },
  { id: 'boltRange', group: 'Miller', label: 'Reach', min: 150, max: 900, step: 20, unit: 'px',
    note: 'How far out it will look for a target.' },

  { id: 'emberDmg', group: 'Ember Wake', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'emberRate', group: 'Ember Wake', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'emberSize', group: 'Ember Wake', label: 'Patch radius', min: 12, max: 130, step: 2, unit: 'px' },
  { id: 'emberLife', group: 'Ember Wake', label: 'Burns for', min: 0.4, max: 8, step: 0.2, unit: 's' },

  { id: 'frostDmg', group: 'Hoarfrost', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'frostRate', group: 'Hoarfrost', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'frostSize', group: 'Hoarfrost', label: 'Ring radius', min: 50, max: 500, step: 10, unit: 'px' },
  { id: 'frostSlow', group: 'Hoarfrost', label: 'Slow', min: 0, max: 2.5, step: 0.05, unit: '×',
    note: 'How hard it holds what it touches.' },

  { id: 'cairnDmg', group: 'Rolling Cairn', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'cairnRate', group: 'Rolling Cairn', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'cairnSize', group: 'Rolling Cairn', label: 'Boulder size', min: 8, max: 80, step: 2, unit: 'px' },
  { id: 'cairnSpeed', group: 'Rolling Cairn', label: 'Roll speed', min: 80, max: 900, step: 20, unit: 'px/s' },

  { id: 'galeDmg', group: 'The Gale', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'galeRate', group: 'The Gale', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'galeSize', group: 'The Gale', label: 'Radius', min: 30, max: 320, step: 5, unit: 'px' },
  { id: 'galePull', group: 'The Gale', label: 'Pull', min: 0, max: 300, step: 5, unit: 'px/s',
    note: 'How hard it drags them inward.' },

  { id: 'ravenDmg', group: 'Raven flock', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'ravenRate', group: 'Raven flock', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'ravenSize', group: 'Raven flock', label: 'Radius', min: 30, max: 320, step: 5, unit: 'px' },
  { id: 'ravenLife', group: 'Raven flock', label: 'Stays for', min: 0.5, max: 10, step: 0.25, unit: 's' },

  { id: 'wolfDmg', group: 'The Pack', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'wolfRate', group: 'The Pack', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'wolfCount', group: 'The Pack', label: 'How many', min: 0.2, max: 4, step: 0.1, unit: '×',
    note: 'Multiplies the number of wolves.' },
  { id: 'wolfSpread', group: 'The Pack', label: 'Spread', min: 40, max: 500, step: 10, unit: 'px',
    note: 'How far apart they pick their targets.' },

  { id: 'bearDmg', group: 'The Bear', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'bearRate', group: 'The Bear', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'bearSize', group: 'The Bear', label: 'Radius', min: 40, max: 500, step: 10, unit: 'px' },
  { id: 'bearKnock', group: 'The Bear', label: 'Knockback', min: 0, max: 900, step: 20, unit: 'px/s' },

  { id: 'elkDmg', group: 'The White Elk', label: 'Damage', min: 0, max: 4, step: 0.05, unit: '×' },
  { id: 'elkRate', group: 'The White Elk', label: 'Rate', min: 0.2, max: 4, step: 0.05, unit: '×' },
  { id: 'elkSize', group: 'The White Elk', label: 'Size', min: 15, max: 200, step: 5, unit: 'px',
    note: 'How broad in the shoulder, and how much it flattens.' },
  { id: 'elkSpeed', group: 'The White Elk', label: 'Charge speed', min: 150, max: 1600, step: 25, unit: 'px/s' },

  { id: 'potionCd', group: 'Other', label: 'Potion cooldown', min: 0, max: 12, step: 0.5, unit: 's' },
  { id: 'potions', group: 'Other', label: 'Potions carried', min: 0, max: 12, step: 1 },
];

/** The defaults. Changing one of these is what "baking in a value" means. */
export const DEFAULTS = /** @type {Record<string, number>} */ ({
  viewWidth: 1350,
  moveSpeed: 190,
  reach: 100,
  swingStep: 2,
  rollDist: 120,
  rollTime: 0.32,
  rollCd: 0.85,
  rollIframes: 0.7,
  rangedWindup: 0.55,
  monHp: 0.7,
  monCd: 1,
  contactPad: 2,
  projSpeed: 430,
  lungeSpeed: 2.7,
  packSize: 3,
  eliteRate: 1,
  attackRate: 1,
  potionHeal: 1,
  autoDmg: 1,
  autoRate: 1,
  axeRadius: 58,
  axesDmg: 1,
  axesRate: 1,
  javDmg: 1,
  javRate: 1,
  boltDmg: 1,
  boltRate: 1,
  emberDmg: 1,
  emberRate: 1,
  frostDmg: 1,
  frostRate: 1,
  cairnDmg: 1,
  cairnRate: 1,
  galeDmg: 1,
  galeRate: 1,
  axesReach: 26,
  javSpeed: 520,
  boltSize: 62,
  boltRange: 420,
  emberSize: 34,
  emberLife: 2.0,
  frostSize: 150,
  frostSlow: 1,
  cairnSize: 22,
  cairnSpeed: 300,
  galeSize: 92,
  galePull: 55,
  ravenSize: 90,
  ravenLife: 2.0,
  wolfCount: 1,
  wolfSpread: 150,
  bearSize: 150,
  bearKnock: 320,
  elkSize: 52,
  elkSpeed: 620,
  ravenDmg: 1,
  ravenRate: 1,
  wolfDmg: 1,
  wolfRate: 1,
  bearDmg: 1,
  bearRate: 1,
  elkDmg: 1,
  elkRate: 1,
  dmgMult: 1.1,
  monSpeed: 1.4,
  aggro: 580,
  potionCd: 1,
  potions: 2,
});

/** Live values. Read this, never a copy of it — the panel writes in place. */
export const T = /** @type {Record<string, number>} */ ({ ...DEFAULTS });

/** @param {string} id @param {number} v */
export function setKnob(id, v) {
  T[id] = v;
  save();
}

export function resetKnobs() {
  for (const k in DEFAULTS) T[k] = DEFAULTS[k];
  save();
}

/** True when anything differs from the defaults. */
export function isTuned() {
  return Object.keys(DEFAULTS).some(k => T[k] !== DEFAULTS[k]);
}

/** Only what differs, so a paste is short and says what actually changed. */
export function changedValues() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k in DEFAULTS) if (T[k] !== DEFAULTS[k]) out[k] = T[k];
  return out;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(changedValues())); } catch { /* private mode */ }
}

export function loadKnobs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    for (const k in d) if (k in DEFAULTS && typeof d[k] === 'number') T[k] = d[k];
  } catch { /* broken storage — defaults are fine */ }
}
