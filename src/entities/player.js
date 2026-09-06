// @ts-check
import { BASES } from '../data/items.js';
import { recalc, xpToNext } from '../systems/stats.js';

/** @typedef {import('../systems/loot.js').Item} Item */
/** @typedef {import('../data/items.js').Slot} Slot */

/** Utrustningsplatser (två ringar, som i D2). */
export const EQUIP_SLOTS = /** @type {const} */ ([
  'weapon', 'shield', 'helm', 'chest', 'gloves', 'boots', 'belt', 'ring1', 'ring2', 'amulet',
]);

export const SLOT_LABEL = /** @type {Record<string,string>} */ ({
  weapon: 'Vapen', shield: 'Sköld', helm: 'Hjälm', chest: 'Rustning', gloves: 'Handskar',
  boots: 'Stövlar', belt: 'Bälte', ring1: 'Ring', ring2: 'Ring', amulet: 'Amulett',
});

/** Vilken bastyp-slot som passar i vilken utrustningsplats. @param {Slot} s */
export function slotsFor(s) {
  return s === 'ring' ? ['ring1', 'ring2'] : [s];
}

/** Väskans rutnät. Rutorna är fler än förr, men föremålen tar olika mycket plats. */
export const BAG_COLS = 10;
export const BAG_ROWS = 6;
export const HOTBAR_SIZE = 6;

/**
 * Lägger en skill i snabbfältet.
 * @param {Player} p @param {string} id
 * @param {boolean} cycle  true = flytta till nästa fack (högerklick), false = bara fylla luckor
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
    name: 'Rostig yxa', affixes: [], mods: {},
  };

  const p = {
    name: name || 'Barbaren',
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, facing: 0, radius: 14,

    level: 1, xp: 0, xpNext: xpToNext(1),
    stats: { str: 20, dex: 18, vit: 22, will: 12 },
    eff: { str: 20, dex: 18, vit: 22, will: 12 },
    statPoints: 0, skillPoints: 1,

    hp: 100, maxHp: 100, stamina: 60, maxStamina: 60, mana: 40, maxMana: 40,
    lifeRegen: 0.35, staminaRegen: 9, manaRegen: 5,
    armor: 0, dmgMin: 1, dmgMax: 3, attackSpeed: 1,
    critChance: 5, critMult: 150,
    coldDmg: 0, fireDmg: 0, lightDmg: 0, freezeChance: 0,
    lifeSteal: 0, magicFind: 0, moveSpeed: 168,
    res: { cold: 0, fire: 0, light: 0 },
    resCap: 75, dmgReduction: 0, stunImmune: false,

    /** @type {Record<string, Item|null>} */
    equipment: {
      weapon: starter, shield: null, helm: null, chest: null, gloves: null,
      boots: null, belt: null, ring1: null, ring2: null, amulet: null,
    },
    /** @type {Item[]} */ inventory: [],
    gold: 0, potions: 3,

    /** @type {Record<string, number>} */ skills: {},
    /** @type {Record<string, number>} */ cooldowns: {},
    /** @type {(string|null)[]} */ hotbar: new Array(HOTBAR_SIZE).fill(null),

    // ---- transient stridstillstånd ----
    attackTimer: 0,
    /** @type {{t:number, dur:number, dir:number, arc:number, reach:number, kind:string}|null} */
    swing: null,
    /** @type {{t:number, dir:number, hit:Set<number>}|null} */ dash: null,
    /** @type {{t:number, dur:number, dir:number}|null} */ roll: null,
    rollCd: 0,
    /** @type {{t:number, tick:number}|null} */ whirl: null,
    dmgBuff: 0, dmgBuffT: 0,
    hitFlash: 0, invuln: 0,
    dead: false, deathT: 0,
    /** Antal dödsfall — vi straffar inte ännu, men vi räknar. */
    deaths: 0,
    kills: 0,
    walkPhase: 0,
  };

  recalc(p);
  p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana;
  return p;
}

/**
 * Ger XP och hanterar nivåhöjningar (kan bli flera på en gång).
 * @param {Player} p @param {number} amount
 * @returns {number} antal nivåer som gavs
 */
export function grantXp(p, amount) {
  p.xp += Math.round(amount);
  let levels = 0;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    levels++;
    p.statPoints += 4;
    p.skillPoints += 1;
    p.xpNext = xpToNext(p.level);
  }
  if (levels) {
    recalc(p);
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.mana = p.maxMana;
  }
  return levels;
}
