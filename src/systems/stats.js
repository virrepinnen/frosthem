// @ts-check
import { clamp } from '../core/math.js';
import { SKILL_BY_ID } from '../data/skills.js';

/** @typedef {import('./loot.js').Item} Item */
/** @typedef {import('../entities/player.js').Player} Player */

/** Uthållighetskostnad för ett grundsvep vid normal vapenhastighet. */
export const ATTACK_COST_BASE = 8;
/** Hur mycket av återhämtningen som är kvar medan man är i strid. */
export const COMBAT_REGEN = 0.4;
/** Hur länge en attack räknas som "i strid". */
export const COMBAT_WINDOW = 1.5;
/** Uthållighet man får tillbaka när en fiende faller. */
export const KILL_STAMINA = 8;

/** Grundtak för motstånd — som i D2 gör taket att man aldrig blir immun.
 *  Isblod kan höja taket, vilket är ett av få sätt att bli märkbart tåligare sent. */
export const RES_CAP = 75;

/** XP som krävs för att gå från `level` till nästa nivå. @param {number} level */
export function xpToNext(level) {
  return Math.floor(46 * Math.pow(level, 1.62) + 24 * level);
}

/**
 * Slår ihop alla modifierare från utrustningen.
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
 * Räknar ut alla härledda värden. Körs om varje gång utrustning, nivå eller
 * skills ändras — aldrig i den heta loopen.
 * @param {Player} p
 */
export function recalc(p) {
  const g = gearMods(p);
  const w = /** @type {Item|null} */ (p.equipment.weapon);
  const rSecond = rank(p, 'secondwind');
  const rTough = rank(p, 'toughskin');
  const rRime = rank(p, 'rimeaura');
  const rBlood = rank(p, 'bloodthirst');
  const rBite = rank(p, 'frostbite');
  const rIceblood = rank(p, 'iceblood');
  const rUnbreak = rank(p, 'unbreakable');

  const str = p.stats.str + (g.str || 0);
  const dex = p.stats.dex + (g.dex || 0);
  const vit = p.stats.vit + (g.vit || 0);
  const will = p.stats.will + (g.will || 0);
  p.eff = { str, dex, vit, will };

  p.maxHp = Math.round(45 + vit * 4 + p.level * 5 + (g.life || 0) + rSecond * 9);
  p.maxStamina = Math.round(40 + will * 3 + (g.stamina || 0) + rSecond * 6);
  p.lifeRegen = 0.35 + (g.lifeRegen || 0) + rSecond * 0.5;
  // Vilo-återhämtning. Under strid går den ner till en bråkdel (se COMBAT_REGEN),
  // vilket är hela poängen: du måste bryta kontakten för att fylla på.
  p.staminaRegen = 9 + will * 0.22;
  // Varje grundattack kostar. Tunga vapen svingar långsammare men tar mer per
  // svep, så att ett stort vapen inte blir gratis uthållighetsmässigt.
  const wSpeed = w?.base.speed ?? 1.15;
  p.attackCost = Math.max(3.5, ATTACK_COST_BASE / wSpeed - will * 0.04);

  // rustning: bas från utrustning, skalad av procentmods och Härdad hud
  let baseArmor = 0;
  for (const slot in p.equipment) {
    const it = /** @type {Item|null} */ (p.equipment[slot]);
    if (it?.base.armor) baseArmor += it.base.armor;
  }
  p.armor = Math.round(baseArmor * (1 + ((g.armorPct || 0) + rTough * 13) / 100)
    + (g.armor || 0) + dex * 0.4 + rUnbreak * 8);

  const wMin = w?.base.dmgMin ?? 1;
  const wMax = w?.base.dmgMax ?? 3;
  const dmgMult = 1 + ((g.dmgPct || 0) + str * 1.0 + rBlood * 2) / 100;
  p.dmgMin = Math.max(1, Math.round(wMin * dmgMult + (g.dmgFlat || 0)));
  p.dmgMax = Math.max(p.dmgMin + 1, Math.round(wMax * dmgMult + (g.dmgFlat || 0)));
  p.attackSpeed = (w?.base.speed ?? 1.15) * (1 + ((g.attackSpeed || 0) + dex * 0.15) / 100);

  p.critChance = 5 + dex * 0.12 + (g.critChance || 0);
  p.critMult = 150 + (g.critMult || 0);
  p.coldDmg = (g.coldDmg || 0) + (rBite > 0 ? 2 + rBite * 2.2 : 0);
  p.fireDmg = g.fireDmg || 0;
  p.lightDmg = g.lightDmg || 0;
  p.freezeChance = (g.freezeChance || 0) + rBite * 2;
  p.lifeSteal = ((g.lifeSteal || 0) + rBlood * 0.7) / 100;
  // Orubblig: platt reduktion ovanpå rustningen, och stunimmunitet vid rank 5.
  p.dmgReduction = Math.min(0.25, rUnbreak * 0.025);
  p.stunImmune = rUnbreak >= 5;
  p.magicFind = g.magicFind || 0;
  p.moveSpeed = 168 * (1 + (g.moveSpeed || 0) / 100);

  const all = (g.resAll || 0) + rTough * 2;
  p.resCap = RES_CAP + rIceblood;
  p.res = {
    cold:  clamp((g.resCold || 0) + all + rRime * 4 + rIceblood * 4, -100, p.resCap),
    fire:  clamp((g.resFire || 0) + all, -100, p.resCap),
    light: clamp((g.resLight || 0) + all, -100, p.resCap),
  };

  p.hp = Math.min(p.hp, p.maxHp);
  p.stamina = Math.min(p.stamina, p.maxStamina);
}

/**
 * Kan spelaren bära föremålet? Krav på styrka/smidighet är D2:s sätt att göra
 * attributpoäng meningsfulla.
 * @param {Player} p @param {Item} item
 */
export function canEquip(p, item) {
  const need = requirementsOf(item);
  return p.eff.str >= need.str && p.eff.dex >= need.dex;
}

/** @param {Item} item */
export function requirementsOf(item) {
  return { str: item.base.reqStr ?? 0, dex: item.base.reqDex ?? 0 };
}

/**
 * Effektiv rank inklusive synergi-bonus.
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
 * Fysisk skadereduktion från rustning.
 * @param {number} armor @param {number} attackerLevel
 */
export function armorReduction(armor, attackerLevel) {
  return clamp(armor / (armor + 48 + 14 * attackerLevel), 0, 0.78);
}
