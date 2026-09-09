// @ts-check
import { rng } from '../core/rng.js';
import { hitMonster } from './combat.js';
import { losBlocked } from './worldmap.js';
import { burst } from '../render/fx.js';
import { T } from './tuning.js';

/** @typedef {import('../entities/player.js').Player} Player */

/**
 * Weapons that fight on their own.
 *
 * Axes that circle you, javelins that throw themselves. They exist for the
 * *rhythm* rather than the numbers: without them there is nothing happening
 * between your own swings, and a fight is a series of separate decisions with
 * dead air in between. With them the fight is always running and your swing is
 * the thing you add to it.
 *
 * Which is exactly why they are kept small. The benchmark is about a fifth of
 * your damage — enough that you feel them working, not enough that standing
 * still becomes a strategy. Everything that matters still has to come from
 * where you put yourself and when you swing.
 *
 * They are not part of the character you build from scratch each run: a relic
 * from an elite or the jarl unlocks one for good, and after that its ranks turn
 * up among the level-up cards, more rarely than an ordinary blessing.
 */

/** Ids of the relics, and the boon each one unlocks. */
export const RELICS = /** @type {const} */ (['axes', 'javelin']);

/**
 * How hard one axe hits, as a share of a weapon swing.
 *
 * Small, and it does not grow with rank. Ranks buy more axes, turning faster,
 * over more ground — more of the fight covered, not a bigger number per hit.
 * Letting the per-hit damage climb too took the pair from a fifth of your
 * damage at rank one to half of it at rank five, which is the point at which
 * standing still becomes a strategy.
 */
const AXE_MULT = 0.13;
/** How long before the same monster can be caught by an axe again. */
const AXE_RECOVER = 0.62;
/** How hard a javelin hits, as a share of a weapon swing. Fixed, like the axe. */
const JAV_MULT = 0.26;

/** @param {Player} p @param {string} id */
export const hasRelic = (p, id) => !!p.relics?.[id];

/** @param {Player} p @param {string} id */
const rank = (p, id) => (hasRelic(p, id) ? (p.boons[id] || 0) : 0);

/**
 * Sets up the state these weapons keep between frames. Safe to call on a
 * character that has neither — it just leaves empty lists behind.
 * @param {any} game
 */
export function resetAutoWeapons(game) {
  game.axes = [];
  game.javelins = [];
  game.autoSpin = 0;
  game.javCd = 0;
}

/** @param {any} game @param {number} dt */
export function updateAutoWeapons(game, dt) {
  const p = game.player;
  if (!game.axes) resetAutoWeapons(game);
  updateAxes(game, p, dt);
  updateJavelins(game, p, dt);
}

/**
 * The axes: a ring that turns with you at its centre.
 *
 * They hit on contact rather than on a timer of their own, so where you stand
 * decides what they catch — walking through a pack is what makes them work, and
 * standing in the open makes them do nothing at all.
 * @param {any} game @param {Player} p @param {number} dt
 */
function updateAxes(game, p, dt) {
  const r = rank(p, 'axes');
  if (r <= 0) { game.axes = []; return; }

  const count = 1 + Math.floor(r / 2);          // 1, 1, 2, 2, 3
  // Tight enough to sweep what you are actually fighting. At the wider radius
  // it tried they circled outside the melee entirely: the thing in front of you
  // stood inside the ring and the axes swept empty snow around it.
  const radius = T.axeRadius + r * 6;
  const spin = (2.0 + r * 0.18) * T.autoRate;
  game.autoSpin = (game.autoSpin + spin * dt) % (Math.PI * 2);

  game.axes = [];
  for (let i = 0; i < count; i++) {
    const a = game.autoSpin + (i / count) * Math.PI * 2;
    game.axes.push({ x: p.pos.x + Math.cos(a) * radius, y: p.pos.y + Math.sin(a) * radius, a });
  }

  const reach = 26;
  for (const m of game.monsters) {
    if (m.dead || m.dormant) continue;
    m.axeCd = Math.max(0, (m.axeCd ?? 0) - dt);
    if (m.axeCd > 0) continue;
    if (Math.abs(m.pos.x - p.pos.x) > radius + 80 || Math.abs(m.pos.y - p.pos.y) > radius + 80) continue;
    for (const ax of game.axes) {
      if (Math.hypot(m.pos.x - ax.x, m.pos.y - ax.y) > reach + m.radius) continue;
      m.axeCd = AXE_RECOVER;
      const mult = AXE_MULT * T.autoDmg;
      const crit = rng.chance(p.critChance / 100);
      const roll = rng.range(p.dmgMin, p.dmgMax) * mult * (1 + p.dmgBuff + (p.shrineDmg || 0));
      hitMonster(game, m, {
        phys: crit ? roll * (p.critMult / 100) : roll,
        cold: p.coldDmg * 0.4, fire: p.fireDmg * 0.4, light: p.lightDmg * 0.4,
        crit, src: 'axes',
      });
      burst(ax.x, ax.y, 4, { color: '#d6e2f2', speed: 90, life: 0.25, size: 1.8 });
      break;
    }
  }
}

/**
 * The javelins: thrown on their own at whatever you can see.
 * @param {any} game @param {Player} p @param {number} dt
 */
function updateJavelins(game, p, dt) {
  const r = rank(p, 'javelin');
  game.javelins ??= [];

  if (r > 0) {
    game.javCd -= dt;
    if (game.javCd <= 0) {
      const range = 380 + r * 24;
      /** @type {any} */
      let best = null; let bd = range;
      for (const m of game.monsters) {
        if (m.dead || m.dormant) continue;
        const d = Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y);
        if (d >= bd) continue;
        bd = d; best = m;
      }
      // One line-of-sight test, on the nearest, rather than one per candidate.
      // Tracing a line is not cheap and there can be a hundred monsters loaded;
      // doing it inside the search cost a 24 ms frame every time it threw.
      if (best && losBlocked(game.world, p.pos.x, p.pos.y, best.pos.x, best.pos.y)) best = null;
      // Nothing in sight costs nothing: the cooldown only starts once it throws.
      if (best) {
        game.javCd = Math.max(0.85, 2.5 - r * 0.28) / T.autoRate;
        const a = Math.atan2(best.pos.y - p.pos.y, best.pos.x - p.pos.x);
        const mult = JAV_MULT * T.autoDmg;
        game.javelins.push({
          x: p.pos.x, y: p.pos.y - 8, a,
          vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
          life: 1.1, mult, pierce: r >= 4 ? 2 : 1,
          /** @type {any[]} */ hit: [],
        });
      }
    }
  }

  for (let i = game.javelins.length - 1; i >= 0; i--) {
    const j = game.javelins[i];
    const px = j.x, py = j.y;
    j.x += j.vx * dt; j.y += j.vy * dt;
    j.life -= dt;
    if (j.life <= 0 || losBlocked(game.world, px, py, j.x, j.y)) {
      burst(j.x, j.y, 5, { color: '#c8b48a', speed: 90, life: 0.3, size: 2 });
      game.javelins.splice(i, 1);
      continue;
    }
    for (const m of game.monsters) {
      if (m.dead || m.dormant || j.hit.includes(m)) continue;
      if (Math.hypot(m.pos.x - j.x, m.pos.y - j.y) > m.radius + 8) continue;
      j.hit.push(m);
      const crit = rng.chance(p.critChance / 100);
      const roll = rng.range(p.dmgMin, p.dmgMax) * j.mult * (1 + p.dmgBuff + (p.shrineDmg || 0));
      hitMonster(game, m, {
        phys: crit ? roll * (p.critMult / 100) : roll,
        cold: p.coldDmg * 0.4, fire: p.fireDmg * 0.4, light: p.lightDmg * 0.4,
        crit, src: 'javelin',
      });
      if (j.hit.length >= j.pierce) { game.javelins.splice(i, 1); break; }
    }
  }
}
