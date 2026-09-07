// @ts-check
import { clamp } from '../core/math.js';
import { SKILL_BY_ID } from '../data/skills.js';
import { boonMods } from './boons.js';

/** @typedef {import('./loot.js').Item} Item */
/** @typedef {import('../entities/player.js').Player} Player */

/** Stamina cost of a basic swing at normal weapon speed. */
export const ATTACK_COST_BASE = 8;
/** How much of the regeneration is left while you are in combat. */
export const COMBAT_REGEN = 0.4;
/** How long an attack counts as "in combat". */
export const COMBAT_WINDOW = 1.5;
/** Stamina returned when an enemy falls. */
export const KILL_STAMINA = 8;

/** Base resistance cap — as in D2, the cap means you never become immune.
 *  Ice Blood can raise it, one of the few ways to get noticeably tougher late. */
export const RES_CAP = 75;

/**
 * XP required to go from `level` to the next one.
 *
 * Slower than it was, and measured rather than guessed. The flat floor means
 * the first levels take two or three packs instead of arriving mid-fight; the
 * exponent keeps that pace roughly constant as packs get richer. Clearing all
 * three zones once lands you around level 19, a normal run around 16.
 * @param {number} level
 */
export function xpToNext(level) {
  return Math.floor(140 + 22 * Math.pow(level, 1.72));
}

/**
 * Merges every modifier from the equipment.
 * @param {Player} p @returns {Record<string, number>}
 */
export function gearMods(p) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const slot in p.equipment) {
    const it = /** @type {Item|null} */ (p.equipment[slot]);
    if (!it) continue;
    for (const k in it.mods) m[k] = (m[k] || 0) + it.mods[k];
  }
  return m;
}

/** @param {Player} p @param {string} id */
export const rank = (p, id) => p.skills[id] || 0;

/**
 * Computes every derived value. Re-run whenever equipment, level, skills or
 * boons change — never in the hot loop.
 *
 * There are no attribute points any more. What they used to carry is split in
 * two: a flat scaling with level (so every level is worth something on its own)
 * and the boons you pick on level-up (so the direction is a choice). Gear mods
 * and boon mods have the same shape, so they merge before anything is derived.
 * @param {Player} p
 */
export function recalc(p) {
  const g = gearMods(p);
  const b = boonMods(p);
  /** @param {string} k */
  const m = (k) => (g[k] || 0) + (b[k] || 0);

  const w = /** @type {Item|null} */ (p.equipment.weapon);
  const L = p.level;
  const rSecond = rank(p, 'secondwind');
  const rTough = rank(p, 'toughskin');
  const rRime = rank(p, 'rimeaura');
  const rBlood = rank(p, 'bloodthirst');
  const rBite = rank(p, 'frostbite');
  const rIceblood = rank(p, 'iceblood');
  const rUnbreak = rank(p, 'unbreakable');

  // The constants are picked so a level-1 character is exactly as strong as it
  // was with the old starting attributes (20/18/22/12) — removing the points
  // should change how you build, not how hard the first pack hits.
  p.maxHp = Math.round(128 + L * 10 + m('life') + rSecond * 9);
  p.lifeRegen = 0.35 + m('lifeRegen') + rSecond * 0.5;

  // Two separate resources, like D2's vitality/energy:
  //   Stamina = the body. Swings and rolls drain it.
  //   Mana = the will. Only magic draws on it, so a melee build barely cares.
  p.maxStamina = Math.round(82 + L * 1.5 + m('stamina') + rSecond * 6);
  p.staminaRegen = 11 + L * 0.15 + m('staminaRegen');
  p.maxMana = Math.round(70 + L * 3 + m('mana'));
  p.manaRegen = 6 + L * 0.2;

  // Every basic attack costs stamina. Heavy weapons swing slower but take more
  // per swing, so a big weapon is never free.
  const wSpeed = w?.base.speed ?? 1.15;
  p.attackCost = Math.max(3.5, ATTACK_COST_BASE / wSpeed);

  // armour: base from equipment, scaled by percentage mods and Tough Hide
  let baseArmor = 0;
  for (const slot in p.equipment) {
    const it = /** @type {Item|null} */ (p.equipment[slot]);
    if (it?.base.armor) baseArmor += it.base.armor;
  }
  p.armor = Math.round(baseArmor * (1 + (m('armorPct') + rTough * 13) / 100)
    + m('armor') + 6 + L * 0.6 + rUnbreak * 8);

  const wMin = w?.base.dmgMin ?? 1;
  const wMax = w?.base.dmgMax ?? 3;
  const dmgMult = 1 + (m('dmgPct') + 16 + L * 3.2 + rBlood * 2) / 100;
  p.dmgMin = Math.max(1, Math.round(wMin * dmgMult + m('dmgFlat')));
  p.dmgMax = Math.max(p.dmgMin + 1, Math.round(wMax * dmgMult + m('dmgFlat')));
  p.attackSpeed = wSpeed * (1 + (m('attackSpeed') + 2 + L * 0.25) / 100);

  p.critChance = 7 + L * 0.25 + m('critChance');
  p.critMult = 150 + m('critMult');
  p.coldDmg = m('coldDmg') + (rBite > 0 ? 2 + rBite * 2.2 : 0);
  p.fireDmg = m('fireDmg');
  p.lightDmg = m('lightDmg');
  p.freezeChance = m('freezeChance') + rBite * 2;
  p.lifeSteal = (m('lifeSteal') + rBlood * 0.7) / 100;
  // Unbreakable: flat reduction on top of armour, and stun immunity at rank 5.
  p.dmgReduction = Math.min(0.25, rUnbreak * 0.025);
  p.stunImmune = rUnbreak >= 5;
  p.magicFind = m('magicFind');
  p.moveSpeed = 168 * (1 + m('moveSpeed') / 100);

  // Boon-only stats. They have no gear equivalent, but go through the same map
  // so a future affix could grant them without touching anything here.
  p.reachMult = 1 + m('reachPct') / 100;
  p.xpMult = 1 + m('xpPct') / 100;
  p.goldMult = 1 + m('goldPct') / 100;
  p.doubleStrike = m('doubleStrike') / 100;

  const all = m('resAll') + rTough * 2;
  p.resCap = RES_CAP + rIceblood;
  p.res = {
    cold:  clamp(m('resCold') + all + rRime * 4 + rIceblood * 4, -100, p.resCap),
    fire:  clamp(m('resFire') + all, -100, p.resCap),
    light: clamp(m('resLight') + all, -100, p.resCap),
  };

  p.hp = Math.min(p.hp, p.maxHp);
  p.stamina = Math.min(p.stamina, p.maxStamina);
  p.mana = Math.min(p.mana ?? p.maxMana, p.maxMana);
}

/**
 * Can the player carry the item? Always — the strength and dexterity
 * requirements went away with the attribute points. Kept as a function so the
 * call sites still read as the question they are asking, and so any future
 * restriction has one place to live.
 * @param {Player} _p @param {Item} _item
 */
export function canEquip(_p, _item) {
  return true;
}

/**
 * Effective rank including the synergy bonus.
 * @param {Player} p @param {string} id
 * @returns {{rank:number, synergy:number}}
 */
export function skillPower(p, id) {
  const def = SKILL_BY_ID.get(id);
  const r = rank(p, id);
  if (!def?.synergy) return { rank: r, synergy: 0 };
  return { rank: r, synergy: rank(p, def.synergy.skill) * def.synergy.pct };
}

/**
 * Physical damage reduction from armour.
 * @param {number} armor @param {number} attackerLevel
 */
export function armorReduction(armor, attackerLevel) {
  return clamp(armor / (armor + 48 + 14 * attackerLevel), 0, 0.78);
}
