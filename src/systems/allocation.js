// @ts-check
import { SKILL_BY_ID, SKILLS, skillAvailability } from '../data/skills.js';
import { recalc } from './stats.js';
import { bindToHotbar } from '../entities/player.js';

/**
 * Point allocation with an undo.
 *
 * Points first go into a *pending* pile that can be taken back. Only on confirm
 * are they written into the character. That lets you experiment without locking
 * in a mistake — the points are permanent once they are in.
 *
 * @typedef {{stats:Record<string,number>, skills:Record<string,number>}} Pending
 */

/** @returns {Pending} */
export function createPending() {
  return { stats: { str: 0, dex: 0, vit: 0, will: 0 }, skills: {} };
}

/** @param {Record<string,number>} o */
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/** @param {any} p @param {Pending} q */
export const statPointsLeft = (p, q) => p.statPoints - sum(q.stats);
/** @param {any} p @param {Pending} q */
export const skillPointsLeft = (p, q) => p.skillPoints - sum(q.skills);
/** @param {Pending} q */
export const pendingStats = (q) => sum(q.stats);
/** @param {Pending} q */
export const pendingSkills = (q) => sum(q.skills);
/** @param {Pending} q */
export const pendingCount = (q) => sum(q.stats) + sum(q.skills);
/** @param {Pending} q */
export const hasPending = (q) => pendingCount(q) > 0;

/** Rank including pending points. @param {any} p @param {Pending} q @param {string} id */
export const rankWith = (p, q, id) => (p.skills[id] || 0) + (q.skills[id] || 0);

/** Attribute value including pending points and equipment. @param {any} p @param {Pending} q @param {string} k */
export const statWith = (p, q, k) => p.eff[k] + (q.stats[k] || 0);

/** The skill map as it would look if you confirmed. @param {any} p @param {Pending} q */
function mergedSkills(p, q) {
  /** @type {Record<string, number>} */
  const m = { ...p.skills };
  for (const id in q.skills) m[id] = (m[id] || 0) + q.skills[id];
  return m;
}

/**
 * Is the skill open right now, counting pending points? That lets you put a
 * point into the parent and the child in the same pass.
 * @param {any} p @param {Pending} q @param {import('../data/skills.js').SkillDef} def
 */
export function availabilityWith(p, q, def) {
  return skillAvailability(mergedSkills(p, q), p.level, def);
}

/** @param {any} p @param {Pending} q @param {string} key */
export function addStat(p, q, key) {
  if (statPointsLeft(p, q) <= 0) return false;
  q.stats[key] = (q.stats[key] || 0) + 1;
  return true;
}

/** @param {any} p @param {Pending} q @param {string} key */
export function removeStat(p, q, key) {
  if ((q.stats[key] || 0) <= 0) return false;
  q.stats[key]--;
  return true;
}

/** @param {any} p @param {Pending} q @param {import('../data/skills.js').SkillDef} def */
export function addSkill(p, q, def) {
  if (skillPointsLeft(p, q) <= 0) return false;
  if (rankWith(p, q, def.id) >= def.maxRank) return false;
  if (!availabilityWith(p, q, def).ok) return false;
  q.skills[def.id] = (q.skills[def.id] || 0) + 1;
  return true;
}

/**
 * Takes back a pending point — but only if no other pending choice depends on
 * it. Otherwise you could saw off the branch you are sitting on.
 * @param {any} p @param {Pending} q @param {string} id
 */
export function removeSkill(p, q, id) {
  if ((q.skills[id] || 0) <= 0) return false;
  q.skills[id]--;
  const stillValid = Object.keys(q.skills)
    .filter(k => q.skills[k] > 0)
    .every(k => {
      const def = SKILL_BY_ID.get(k);
      return def ? availabilityWith(p, q, def).ok : true;
    });
  if (!stillValid) { q.skills[id]++; return false; }
  if (q.skills[id] === 0) delete q.skills[id];
  return true;
}

/** @param {Pending} q */
export function resetStats(q) {
  for (const k in q.stats) q.stats[k] = 0;
}
/** @param {Pending} q */
export function resetSkills(q) {
  for (const k in q.skills) delete q.skills[k];
}
/** @param {Pending} q */
export function resetPending(q) { resetStats(q); resetSkills(q); }

/**
 * Attributes and skills are confirmed separately. They are different kinds of
 * decision and live in different places in the UI — lumping them together meant
 * you could accidentally confirm one when you meant the other.
 * @param {any} game @param {Pending} q
 */
export function commitStats(game, q) {
  const p = game.player;
  if (pendingStats(q) <= 0) return false;
  for (const k in q.stats) {
    if (!q.stats[k]) continue;
    p.stats[k] += q.stats[k];
    p.statPoints -= q.stats[k];
  }
  resetStats(q);
  after(game);
  return true;
}

/** @param {any} game @param {Pending} q */
export function commitSkills(game, q) {
  const p = game.player;
  if (pendingSkills(q) <= 0) return false;
  for (const id in q.skills) {
    const n = q.skills[id];
    if (!n) continue;
    p.skills[id] = (p.skills[id] || 0) + n;
    p.skillPoints -= n;
    const def = SKILL_BY_ID.get(id);
    if (def?.type === 'active') bindToHotbar(p, id, false);
  }
  resetSkills(q);
  after(game);
  return true;
}

/** @param {any} game */
function after(game) {
  recalc(game.player);
  game.dirtyUI = true;
  game.autosave?.();
}

/** Convenience: confirm everything pending. @param {any} game @param {Pending} q */
export function commitPending(game, q) {
  const a = commitStats(game, q);
  const b = commitSkills(game, q);
  return a || b;
}

export { SKILLS, SKILL_BY_ID };
