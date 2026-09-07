// @ts-check
import { SKILLS, SKILL_BY_ID, skillAvailability } from '../data/skills.js';
import { recalc } from './stats.js';
import { bindToHotbar } from '../entities/player.js';

/**
 * The skill trees, bought at the hearth in Frosthem.
 *
 * They used to be spent from points earned on level-up, which meant every level
 * stopped the game for an allocation screen. Now the fight only ever offers a
 * card, and the trees are something you come home and invest in — with gold.
 *
 * That makes gold the currency that permanently builds the character, which is
 * also why it drops in fewer and heavier piles: every pile is a step towards a
 * rank you have your eye on.
 *
 * The prerequisites are unchanged. You still have to buy your way down a branch
 * to reach its capstone.
 */

/** @typedef {import('../data/skills.js').SkillDef} SkillDef */
/** @typedef {import('../entities/player.js').Player} Player */

/**
 * What the next rank costs. Deeper tiers and higher ranks cost more, so a
 * capstone is a project rather than an afternoon.
 * @param {SkillDef} def @param {number} rank Current rank
 */
export function skillPrice(def, rank) {
  return Math.round(130 * def.tier * Math.pow(rank + 1, 1.6));
}

/**
 * May the player buy one more rank right now, and if not, why?
 * @param {Player} p @param {SkillDef} def
 * @returns {{ok:boolean, reason:string, price:number}}
 */
export function canBuy(p, def) {
  const rank = p.skills[def.id] || 0;
  const price = skillPrice(def, rank);
  if (rank >= def.maxRank) return { ok: false, reason: 'Mastered', price };
  const avail = skillAvailability(p.skills, p.level, def);
  if (!avail.ok) return { ok: false, reason: avail.reason, price };
  if (p.gold < price) return { ok: false, reason: `Needs ${price} gold`, price };
  return { ok: true, reason: '', price };
}

/**
 * Buys one rank. Active skills go onto the hotbar the first time they are
 * bought, so a purchase is immediately usable.
 * @param {any} game @param {SkillDef} def
 */
export function buySkill(game, def) {
  const p = game.player;
  const check = canBuy(p, def);
  if (!check.ok) { game.alert(check.reason); return false; }
  p.gold -= check.price;
  p.skills[def.id] = (p.skills[def.id] || 0) + 1;
  if (def.type === 'active') bindToHotbar(p, def.id, false);
  recalc(p);
  game.dirtyUI = true;
  game.autosave?.();
  game.alert(`${def.name} rank ${p.skills[def.id]} — ${check.price} gold.`);
  return true;
}

export { SKILLS, SKILL_BY_ID };
