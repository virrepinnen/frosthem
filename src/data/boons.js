// @ts-check
/**
 * Boons — the cards you pick when you level up.
 *
 * The model is Halls of Torment's traits, and the reason is the same: a level-up
 * should be *one click*, not a window you have to administrate. So every boon is
 * a flat, legible number, and the interesting decision is which direction you
 * lean, not how you split four points four ways.
 *
 * Ranks open with level, which keeps early choices simple and lets late choices
 * be worth waiting for. `at[i]` is the level required for rank i+1.
 *
 * @typedef {Object} BoonDef
 * @property {string} id
 * @property {string} name
 * @property {string} icon    Glyph name from ui/glyphs.js
 * @property {'offence'|'defence'|'utility'} group
 * @property {number[]} at    Level required for each rank, one entry per rank
 * @property {number} [weight] Draw weight (default 10)
 * @property {(r:number)=>string} line  What one more rank gives, in words
 * @property {Record<string,number>} per Stat gained per rank; folded in by recalc
 * @property {string} [needs] Relic that must be found before this is offered
 */

/**
 * Rank thresholds shared by the ordinary boons. They are pitched against the
 * levels a run actually reaches — around 16 for a normal pass, 19 for a full
 * clear — so the fifth rank is something the last stretch can just about buy,
 * not a number in a table nobody ever sees.
 */
const BASIC = [1, 4, 8, 13, 19];
/** The rarer boons only enter the pool once the build has shape. */
const HIGH = [10, 16, 24];

/**
 * A weapon that fights on its own is not part of the pool you start with. Its
 * relic drops from an elite or the jarl and stays with the character; only then
 * do its ranks turn up among the cards. They are weighted *above* an ordinary
 * blessing: a relic is a rare thing to find, and once found it should be the
 * thing the run is about rather than a card you see twice an act.
 */
const RELIC_RANKS = [1, 1, 1, 1, 1];

/** @type {BoonDef[]} */
export const BOONS = [
  // ---- weapons that fight on their own -------------------------------------
  {
    id: 'axes', name: 'Whirling Axes', icon: 'axe', group: 'offence',
    at: RELIC_RANKS, weight: 14, needs: 'axes', per: {},
    line: (r) => r <= 1
      ? 'An axe circles you, striking whatever it passes through.'
      : `Faster, wider, heavier${r % 2 === 1 ? ' — and one axe more' : ''} (rank ${r}).`,
  },
  {
    id: 'javelin', name: 'Hurled Javelins', icon: 'polearm', group: 'offence',
    at: RELIC_RANKS, weight: 14, needs: 'javelin', per: {},
    line: (r) => r <= 1
      ? 'You throw a javelin at whatever you can see, on your own.'
      : `Thrown harder and more often${r >= 4 ? ', and through two' : ''} (rank ${r}).`,
  },
  {
    id: 'thunder', name: 'The Miller', icon: 'lightning', group: 'offence',
    at: RELIC_RANKS, weight: 14, needs: 'thunder', per: {},
    line: (r) => r <= 1
      ? 'Lightning falls somewhere in the fight, and everything under it burns.'
      : `Falls more often, wider, and further out (rank ${r}).`,
  },

  // ---- offence -------------------------------------------------------------
  {
    id: 'edge', name: 'Whetted', icon: 'edge', group: 'offence', at: BASIC,
    per: { dmgPct: 8 },
    line: (r) => `+8% weapon damage (rank ${r} → +${r * 8}%)`,
  },
  {
    id: 'swift', name: 'Swift Arm', icon: 'swift', group: 'offence', at: BASIC,
    per: { attackSpeed: 7 },
    line: (r) => `+7% attack speed (rank ${r} → +${r * 7}%)`,
  },
  {
    id: 'keen', name: 'Keen Edge', icon: 'crit', group: 'offence', at: BASIC,
    per: { critChance: 2, critMult: 8 },
    line: (r) => `+2% critical hit, +8% critical damage (rank ${r})`,
  },
  {
    id: 'heavyhand', name: 'Heavy Hand', icon: 'weight', group: 'offence', at: BASIC,
    per: { dmgFlat: 2 },
    line: (r) => `+2 damage on every hit (rank ${r} → +${r * 2})`,
  },

  // ---- defence -------------------------------------------------------------
  {
    id: 'hardy', name: 'Hardy', icon: 'vit', group: 'defence', at: BASIC,
    per: { life: 18 },
    line: (r) => `+18 maximum life (rank ${r} → +${r * 18})`,
  },
  {
    id: 'tempered', name: 'Tempered', icon: 'shield', group: 'defence', at: BASIC,
    per: { armor: 6 },
    line: (r) => `+6 armour (rank ${r} → +${r * 6})`,
  },
  {
    id: 'knitting', name: 'Knitting Flesh', icon: 'regen', group: 'defence', at: BASIC,
    per: { lifeRegen: 0.1 },
    line: (r) => `+0.1 life per second (rank ${r} → +${(r * 0.1).toFixed(1)}/s)`,
  },
  {
    id: 'coldblooded', name: 'Coldblooded', icon: 'resist', group: 'defence', at: BASIC,
    per: { resAll: 6 },
    line: (r) => `+6% to all resistances (rank ${r} → +${r * 6}%)`,
  },

  // ---- utility -------------------------------------------------------------
  {
    id: 'lightfoot', name: 'Light Footed', icon: 'boot', group: 'utility', at: BASIC,
    per: { moveSpeed: 7 },
    line: (r) => `+7% movement speed (rank ${r} → +${r * 7}%)`,
  },
  {
    id: 'breath', name: 'Second Breath', icon: 'secondwind', group: 'utility', at: BASIC,
    per: { mana: 12, manaRegen: 0.25 },
    line: (r) => `+12 mana, +0.25 mana per second (rank ${r})`,
  },
  {
    id: 'ravenous', name: 'Ravenous', icon: 'leech', group: 'utility', at: BASIC,
    per: { lifeSteal: 0.5 },
    line: (r) => `+0.5% life steal (rank ${r} → +${(r * 0.5).toFixed(1)}%)`,
  },
  {
    id: 'widearc', name: 'Wide Arc', icon: 'arc', group: 'utility', at: BASIC,
    per: { reachPct: 8 },
    line: (r) => `+8% reach and arc on your swings (rank ${r} → +${r * 8}%)`,
  },
  {
    id: 'studious', name: 'Studious', icon: 'scroll', group: 'utility', at: BASIC, weight: 7,
    per: { xpPct: 12 },
    line: (r) => `+12% experience (rank ${r} → +${r * 12}%)`,
  },
  {
    id: 'covetous', name: 'Covetous', icon: 'coinstar', group: 'utility', at: BASIC, weight: 7,
    per: { goldPct: 15, magicFind: 10 },
    line: (r) => `+15% gold, +10% magic find (rank ${r})`,
  },

  // ---- rarer, and only once the build has shape ----------------------------
  {
    id: 'twinstrike', name: 'Double Strike', icon: 'twin', group: 'offence', at: HIGH, weight: 5,
    per: { doubleStrike: 8 },
    line: (r) => `${r * 8}% chance for a swing to land twice`,
  },
  {
    id: 'frostborn', name: 'Frostborn', icon: 'wintergrasp', group: 'offence', at: HIGH, weight: 5,
    per: { coldDmg: 9, freezeChance: 4 },
    line: (r) => `+9 cold damage, +4% chance to freeze (rank ${r})`,
  },
];

/** @type {Map<string, BoonDef>} */
export const BOON_BY_ID = new Map(BOONS.map(b => [b.id, b]));

/** Roman numerals for the rank badge; boons never go past five ranks. */
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
