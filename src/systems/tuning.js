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
  { id: 'reach', group: 'You', label: 'Swing reach', min: 40, max: 160, step: 2, unit: 'px' },
  { id: 'swingStep', group: 'You', label: 'Step into the swing', min: 0, max: 90, step: 2, unit: 'px',
    note: 'How far the basic attack carries you forward.' },
  { id: 'rollDist', group: 'You', label: 'Roll distance', min: 80, max: 500, step: 5, unit: 'px',
    note: 'Actual pixels travelled, deceleration included.' },
  { id: 'rollTime', group: 'You', label: 'Roll duration', min: 0.14, max: 0.5, step: 0.02, unit: 's' },
  { id: 'rollCd', group: 'You', label: 'Roll cooldown', min: 0, max: 2.5, step: 0.05, unit: 's' },
  { id: 'rollIframes', group: 'You', label: 'Roll invulnerable window', min: 0, max: 1, step: 0.05,
    note: 'Share of the roll you cannot be hit during.' },

  { id: 'rangedWindup', group: 'Monsters', label: 'Ranged draw', min: 0.15, max: 1.6, step: 0.05, unit: 's',
    note: 'How long an archer aims before the shot. The aim locks when it starts.' },
  { id: 'dmgMult', group: 'Monsters', label: 'Damage', min: 0.3, max: 3.5, step: 0.1, unit: '×',
    note: 'Multiplies everything they hit you for.' },
  { id: 'monSpeed', group: 'Monsters', label: 'Speed', min: 0.5, max: 2, step: 0.05, unit: '×' },
  { id: 'aggro', group: 'Monsters', label: 'Aggro range', min: 200, max: 900, step: 20, unit: 'px' },

  { id: 'potionCd', group: 'Other', label: 'Potion cooldown', min: 0, max: 12, step: 0.5, unit: 's' },
  { id: 'potions', group: 'Other', label: 'Potions carried', min: 0, max: 12, step: 1 },
];

/** The defaults. Changing one of these is what "baking in a value" means. */
export const DEFAULTS = /** @type {Record<string, number>} */ ({
  viewWidth: 1350,
  moveSpeed: 168,
  reach: 100,
  swingStep: 4,
  rollDist: 120,
  rollTime: 0.32,
  rollCd: 0.85,
  rollIframes: 0.7,
  rangedWindup: 0.55,
  dmgMult: 1.5,
  monSpeed: 0.9,
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
