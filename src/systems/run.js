// @ts-check
import { xpToNext, recalc } from './stats.js';
import { ZONE_DEFS } from './world.js';

/**
 * Runs.
 *
 * A run starts in Frosthem at level 1 and ends when you die or when Hravn
 * falls. What it costs you is the climb — the level and the blessings you drew
 * along the way. What it never costs you is your things: gold, gear and the
 * skill ranks you bought with gold all come home either way.
 *
 * That split is the whole design. Gear and skill trees are the *permanent*
 * power, so every run leaves you a little stronger and gets you a little
 * further; level and blessings are the *temporary* power, so every run still
 * asks you to build a character from the bottom. Dying hurts without ever
 * putting you behind where you started, which is what makes another attempt
 * feel worth it rather than owed.
 *
 * Because gear persists, items have to be rare and quiet — a run's worth of
 * loot is meant to be a nudge, not a new character.
 */

/** @typedef {import('../entities/player.js').Player} Player */

/** @returns {{startedAt:number, kills:number, gold:number, deepest:number}} */
export function newRunStats() {
  return { startedAt: Date.now(), kills: 0, gold: 0, deepest: 0 };
}

/**
 * Wipes the temporary half of the character and starts the clock again.
 * Called both when a fresh character walks into the world and when a previous
 * run has ended.
 * @param {any} game
 */
export function startRun(game) {
  const p = game.player;
  p.level = 1;
  p.xp = 0;
  p.xpNext = xpToNext(1);
  p.boons = {};
  p.boonPicks = 0;
  p.dead = false;
  p.deathT = 0;
  p.potions = Math.max(p.potions ?? 0, 3);
  recalc(p);
  p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana;
  game.run = newRunStats();
  game.runNo = (game.runNo ?? 0) + 1;
}

/**
 * Ends the run and returns what it is worth, for the summary screen.
 * Nothing is taken away here — the reset happens in {@link startRun}, so the
 * summary can still read the level and blessings the run reached.
 * @param {any} game @param {'death'|'victory'} cause
 */
export function endRun(game, cause) {
  const p = game.player;
  const run = game.run ?? newRunStats();
  const depth = Math.max(run.deepest, game.zone?.index ?? 0);
  const record = depth > (game.bestDepth ?? 0);
  if (record) game.bestDepth = depth;
  game.runs = (game.runs ?? 0) + 1;
  return {
    cause,
    level: p.level,
    kills: run.kills,
    gold: run.gold,
    minutes: Math.max(1, Math.round((Date.now() - run.startedAt) / 60000)),
    depth,
    depthName: ZONE_DEFS[depth]?.name ?? '—',
    record,
    best: game.bestDepth ?? depth,
    bestName: ZONE_DEFS[game.bestDepth ?? depth]?.name ?? '—',
  };
}

/**
 * Notes how far this run got. Called on every zone change; the run's depth is
 * the furthest map reached, not the one you happen to stand in — walking back
 * to town for supplies must not undo the record.
 * @param {any} game @param {number} index
 */
export function markDepth(game, index) {
  if (!game.run) return;
  if (index > game.run.deepest) game.run.deepest = index;
}
