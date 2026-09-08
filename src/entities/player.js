// @ts-check
import { BASES } from '../data/items.js';
import { recalc, xpToNext } from '../systems/stats.js';
import { T } from '../systems/tuning.js';

/** @typedef {import('../systems/loot.js').Item} Item */
/** @typedef {import('../data/items.js').Slot} Slot */

/** Equipment slots (two rings, as in D2). */
export const EQUIP_SLOTS = /** @type {const} */ ([
  'weapon', 'shield', 'helm', 'chest', 'gloves', 'boots', 'belt', 'ring1', 'ring2', 'amulet',
]);

export const SLOT_LABEL = /** @type {Record<string,string>} */ ({
  weapon: 'Weapon', shield: 'Shield', helm: 'Helm', chest: 'Armour', gloves: 'Gloves',
  boots: 'Boots', belt: 'Belt', ring1: 'Ring', ring2: 'Ring', amulet: 'Amulet',
});

/** Which base-type slot fits which equipment slot. @param {Slot} s */
export function slotsFor(s) {
  return s === 'ring' ? ['ring1', 'ring2'] : [s];
}

/** How long the town portal takes to cast, and how much of that is the opening. */
export const PORTAL_CAST = 2.5;
export const PORTAL_STEP = 0.5;

export const BAG_COLS = 12;
export const BAG_ROWS = 6;
export const HOTBAR_SIZE = 6;

/**
 * Puts a skill on the hotbar.
 * @param {Player} p @param {string} id
 * @param {boolean} cycle  true = move to the next slot (right click), false = only fill gaps
 */
export function bindToHotbar(p, id, cycle) {
  const at = p.hotbar.indexOf(id);
  if (!cycle) {
    if (at >= 0) return;
    const free = p.hotbar.indexOf(null);
    if (free >= 0) p.hotbar[free] = id;
    return;
  }
  const to = at < 0 ? (p.hotbar.indexOf(null) >= 0 ? p.hotbar.indexOf(null) : 0)
                    : (at + 1) % HOTBAR_SIZE;
  const displaced = p.hotbar[to];
  p.hotbar[to] = id;
  if (at >= 0) p.hotbar[at] = displaced;
}

/**
 * @typedef {ReturnType<typeof createPlayer>} Player
 */
/** @param {string} [name] */
export function createPlayer(name) {
  const rusty = BASES.find(b => b.id === 'rustyaxe');
  /** @type {Item} */
  const starter = {
    uid: 0, base: /** @type {any} */ (rusty), rarity: 'normal', ilvl: 1,
    name: 'Rusty Axe', affixes: [], mods: {},
  };

  const p = {
    name: name || 'Barbarian',
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, facing: 0, radius: 14,

    level: 1, xp: 0, xpNext: xpToNext(1),
    /** Boon ranks, keyed by boon id. One card is picked per level. */
    /** @type {Record<string, number>} */ boons: {},
    /** Relics found; a weapon's ranks are only offerable once its relic is here. @type {Record<string, boolean>} */
    relics: {},
    /** The lean into a swing. @type {null|{t:number,dur:number,dir:number,dist:number}} */
    step: null,
    /** Level-ups whose card has not been picked yet. */
    boonPicks: 0,

    hp: 100, maxHp: 100, mana: 40, maxMana: 40,
    lifeRegen: 0.35, manaRegen: 5,
    armor: 0, dmgMin: 1, dmgMax: 3, attackSpeed: 1,
    critChance: 5, critMult: 150,
    coldDmg: 0, fireDmg: 0, lightDmg: 0, freezeChance: 0,
    lifeSteal: 0, magicFind: 0, moveSpeed: 168,
    reachMult: 1, xpMult: 1, goldMult: 1, doubleStrike: 0,
    res: { cold: 0, fire: 0, light: 0 },
    resCap: 75, dmgReduction: 0, stunImmune: false,

    /** @type {Record<string, Item|null>} */
    equipment: {
      weapon: starter, shield: null, helm: null, chest: null, gloves: null,
      boots: null, belt: null, ring1: null, ring2: null, amulet: null,
    },
    /** @type {Item[]} */ inventory: [],
    gold: 0, potions: T.potions,

    /** @type {Record<string, number>} */ skills: { cleave: 1 },
    /** @type {Record<string, number>} */ cooldowns: {},
    /** @type {(string|null)[]} */ hotbar: new Array(HOTBAR_SIZE).fill(null),

    // ---- transient combat state ----
    attackTimer: 0,
    /** @type {{t:number, dur:number, dir:number, arc:number, reach:number, kind:string}|null} */
    swing: null,
    /** @type {{t:number, dir:number, hit:Set<number>}|null} */ dash: null,
    /** @type {{t:number, dur:number, dir:number}|null} */ roll: null,
    /**
     * Town portal in progress. Charges for {@link PORTAL_CAST} seconds; during
     * the last {@link PORTAL_STEP} the gate opens and the figure steps in.
     * @type {{t:number, x:number, y:number}|null}
     */
    cast: null,
    rollCd: 0, potionCd: 0,
    /** Actual velocity, measured from the movement — covers walking, dashing and rolling. */
    velX: 0, velY: 0,
    /** Movement input this frame (-1..1). The zone border reads it. */
    inX: 0, inY: 0,
    /**
     * The cloak's deflection as a damped spring. It reaches in the *opposite*
     * direction to the movement, so the cloth trails behind, and swings back to
     * rest with a couple of decaying oscillations when you stop.
     */
    cloak: { x: 0, y: 0, vx: 0, vy: 0 },
    /** @type {{t:number, tick:number}|null} */ whirl: null,
    dmgBuff: 0, dmgBuffT: 0,
    hitFlash: 0, invuln: 0,
    dead: false, deathT: 0,
    /** Death count — we do not punish yet, but we count. */
    deaths: 0,
    kills: 0,
    walkPhase: 0,
  };

  // One skill to start with, so the hotbar is not empty and the first fight has
  // something to press. Every rank after this one is bought at the hearth.
  bindToHotbar(p, 'cleave', false);
  recalc(p);
  p.hp = p.maxHp; p.mana = p.maxMana;
  return p;
}

/**
 * Grants XP and handles level-ups (there can be several at once).
 * @param {Player} p @param {number} amount
 * @returns {number} how many levels were gained
 */
export function grantXp(p, amount) {
  p.xp += Math.round(amount);
  let levels = 0;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    levels++;
    // One card per level. No attribute points, no skill points — skills are
    // bought at the hearth with gold, so the fight is never interrupted by an
    // allocation screen.
    p.boonPicks += 1;
    p.xpNext = xpToNext(p.level);
  }
  if (levels) {
    recalc(p);
    p.hp = p.maxHp;
    p.mana = p.maxMana;
  }
  return levels;
}
