// @ts-check
import { BOONS, BOON_BY_ID } from '../data/boons.js';
import { rng } from '../core/rng.js';
import { recalc } from './stats.js';

/** @typedef {import('../entities/player.js').Player} Player */
/** @typedef {import('../data/boons.js').BoonDef} BoonDef */

/** How many cards a level-up offers. */
export const CARDS = 3;

/** @param {Player} p @param {string} id */
export const boonRank = (p, id) => p.boons[id] || 0;

/**
 * Can this boon still be offered? A boon leaves the pool when it is maxed, and
 * a boon whose *next* rank needs a higher level is not offered either — that is
 * what makes late ranks something to climb towards rather than luck.
 * @param {Player} p @param {BoonDef} b
 */
export function boonAvailable(p, b) {
  const r = boonRank(p, b.id);
  if (r >= b.at.length) return false;
  return p.level >= b.at[r];
}

/**
 * Draws the cards for one level-up: distinct, weighted, never a maxed or
 * level-locked boon.
 *
 * If fewer than `CARDS` boons are available we return what there is rather than
 * padding — three identical cards would be worse than two real ones.
 * @param {Player} p @param {number} [n]
 * @returns {BoonDef[]}
 */
export function drawBoons(p, n = CARDS) {
  const pool = BOONS.filter(b => boonAvailable(p, b));
  /** @type {BoonDef[]} */
  const out = [];
  const left = pool.slice();
  while (out.length < n && left.length) {
    const pick = rng.weighted(left, b => b.weight ?? 10);
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}

/**
 * Takes a boon. Ranks are permanent — there is no undo, because the whole point
 * of the card is that the choice is instant and cheap.
 * @param {Player} p @param {string} id
 */
export function takeBoon(p, id) {
  const def = BOON_BY_ID.get(id);
  if (!def) return false;
  const r = boonRank(p, id);
  if (r >= def.at.length) return false;
  p.boons[id] = r + 1;
  recalc(p);
  return true;
}

/**
 * Everything the taken boons add up to, as a flat modifier map in the same
 * shape as gear mods — so `recalc` can treat both the same way.
 * @param {Player} p @returns {Record<string, number>}
 */
export function boonMods(p) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const id in p.boons) {
    const def = BOON_BY_ID.get(id);
    const r = p.boons[id];
    if (!def || !r) continue;
    for (const k in def.per) m[k] = (m[k] || 0) + def.per[k] * r;
  }
  return m;
}

/** The boons a character holds, for the character sheet. @param {Player} p */
export function heldBoons(p) {
  return BOONS.filter(b => boonRank(p, b.id) > 0)
    .map(b => ({ def: b, rank: boonRank(p, b.id) }))
    .sort((a, z) => z.rank - a.rank || a.def.name.localeCompare(z.def.name));
}
