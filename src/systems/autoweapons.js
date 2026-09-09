// @ts-check
import { rng } from '../core/rng.js';
import { hitMonster, applySlow, applyStun } from './combat.js';
import { losBlocked } from './worldmap.js';
import { burst } from '../render/fx.js';
import { T } from './tuning.js';
import { RELIC_IDS } from '../data/relics.js';

/** @typedef {import('../entities/player.js').Player} Player */

/**
 * Weapons that fight on their own.
 *
 * They exist for the *rhythm* rather than the numbers: without them nothing
 * happens between your own swings, and a fight becomes a row of separate
 * decisions with dead air in between. With them the fight is always running and
 * your swing is what you add to it. The benchmark is that they stay a modest
 * share of your damage — enough to feel, not enough that standing still becomes
 * a strategy.
 *
 * What makes one different from another is not its element but what it asks of
 * you. The axes want you inside a pack; the embers want you moving through one;
 * the cairn wants you lined up with something; the gale wants you to herd. Every
 * one of them is a reason to stand somewhere particular.
 *
 * Each has its own damage and rate knob in the tuning panel, on top of the two
 * that move all of them at once — these are new and their numbers are guesses,
 * so they are meant to be dragged rather than argued about.
 */

export const RELICS = RELIC_IDS;

/** @param {Player} p @param {string} id */
export const hasRelic = (p, id) => !!p.relics?.[id];
/** @param {Player} p @param {string} id */
const rank = (p, id) => (hasRelic(p, id) ? (p.boons[id] || 0) : 0);

/** Damage knob for one weapon, folded together with the master. @param {string} k */
const dmgOf = (k) => T[k] * T.autoDmg;
/** Rate knob for one weapon, folded together with the master. @param {string} k */
const rateOf = (k) => Math.max(0.05, T[k] * T.autoRate);

/**
 * One hit from an automatic weapon. They all crit off your own numbers and all
 * carry a fraction of your weapon damage, so gear and blessings lift them with
 * you rather than leaving them behind.
 * @param {any} game @param {any} m @param {number} mult @param {string} src
 * @param {'phys'|'cold'|'fire'|'light'} [type]
 */
function strike(game, m, mult, src, type = 'phys') {
  const p = game.player;
  const crit = rng.chance(p.critChance / 100);
  const roll = rng.range(p.dmgMin, p.dmgMax) * mult * (1 + p.dmgBuff + (p.shrineDmg || 0));
  const dmg = crit ? roll * (p.critMult / 100) : roll;
  hitMonster(game, m, { [type]: dmg, crit, src });
}

/** @param {any} game */
export function resetAutoWeapons(game) {
  game.axes = [];
  game.javelins = [];
  game.bolts = [];
  game.embers = [];
  game.rings = [];
  game.boulders = [];
  game.gales = [];
  game.flocks = [];
  game.pounces = [];
  game.slams = [];
  game.charges = [];
  game.autoSpin = 0;
  game.cd = {
    javelin: 0, thunder: 0, ember: 0, frost: 0, cairn: 0, gale: 0,
    raven: 0, wolf: 0, bear: 0, elk: 0,
  };
}

/** @param {any} game @param {number} dt */
export function updateAutoWeapons(game, dt) {
  const p = game.player;
  if (!game.cd) resetAutoWeapons(game);
  axes(game, p, dt);
  javelins(game, p, dt);
  thunder(game, p, dt);
  ember(game, p, dt);
  frost(game, p, dt);
  cairn(game, p, dt);
  gale(game, p, dt);
  raven(game, p, dt);
  wolf(game, p, dt);
  bear(game, p, dt);
  elk(game, p, dt);
}

/**
 * The four that come when called.
 *
 * They share a shape: a long wait, then something arrives somewhere out in the
 * fight and lands on a crowd. That is the point of them — the other weapons are
 * a constant hum you stop noticing, and these are events. Ten seconds is long
 * enough that you look up when one happens.
 *
 * Because the wait is fixed, their ranks buy reach and weight rather than
 * frequency. Every one of them aims itself at the thickest part of the fight
 * rather than at what is nearest, so where the crowd is decides where they go.
 */
const ANIMAL_CD = 10;

/**
 * The spot with the most bodies around it, within `range`.
 *
 * Sampled from the monsters themselves rather than a grid: they *are* the
 * interesting points, and there are never more of them than there are of them.
 * The candidate list is capped because this runs on a fight, not on a map.
 * @param {any} game @param {any} p @param {number} range @param {number} radius
 */
function thickest(game, p, range, radius) {
  const list = near(game, p.pos.x, p.pos.y, range);
  if (!list.length) return null;
  const pool = list.length > 40 ? rng.shuffle(list.slice()).slice(0, 40) : list;
  let best = null, bestN = -1;
  for (const c of pool) {
    let n = 0;
    for (const m of list) {
      if (Math.abs(m.pos.x - c.pos.x) > radius || Math.abs(m.pos.y - c.pos.y) > radius) continue;
      n++;
    }
    if (n > bestN) { bestN = n; best = c; }
  }
  return best ? { x: best.pos.x, y: best.pos.y, n: bestN } : null;
}

/**
 * The raven on your shoulder calls the wood down. A circle that stays put and
 * keeps working, so it is the one that punishes a crowd for not moving.
 */
function raven(game, p, dt) {
  const r = rank(p, 'raven');
  game.flocks ??= [];
  for (let i = game.flocks.length - 1; i >= 0; i--) {
    const f = game.flocks[i];
    f.t += dt;
    f.tick -= dt;
    if (f.tick <= 0) {
      f.tick = 0.35;
      for (const m of near(game, f.x, f.y, f.r)) strike(game, m, 0.10 * dmgOf('ravenDmg'), 'raven');
      burst(f.x + rng.range(-f.r, f.r), f.y + rng.range(-f.r, f.r), 4,
        { color: '#1d2432', speed: 70, life: 0.5, size: 2.4, grav: -30 });
    }
    if (f.t >= f.dur) game.flocks.splice(i, 1);
  }
  if (r <= 0) return;
  if (!due(game, 'raven', dt, ANIMAL_CD / rateOf('ravenRate'))) return;
  const radius = T.ravenSize + r * 8;
  const at = thickest(game, p, 560, radius);
  if (!at) { game.cd.raven = 0.4; return; }
  game.flocks.push({ x: at.x, y: at.y, t: 0, tick: 0, dur: T.ravenLife + r * 0.35, r: radius });
}

/**
 * Wolves out of the trees: one throat each, spread across the crowd rather than
 * piled onto whatever is nearest. It is the one that reaches several at once
 * without needing them bunched.
 */
function wolf(game, p, dt) {
  const r = rank(p, 'wolf');
  game.pounces ??= [];
  for (let i = game.pounces.length - 1; i >= 0; i--) {
    game.pounces[i].t += dt;
    if (game.pounces[i].t >= game.pounces[i].dur) game.pounces.splice(i, 1);
  }
  if (r <= 0) return;
  if (!due(game, 'wolf', dt, ANIMAL_CD / rateOf('wolfRate'))) return;
  const spread = T.wolfSpread + r * 12;
  const at = thickest(game, p, 560, spread);
  if (!at) { game.cd.wolf = 0.4; return; }
  const list = rng.shuffle(near(game, at.x, at.y, spread));
  const count = Math.min(list.length, Math.max(1, Math.round((2 + r) * T.wolfCount)));
  for (let i = 0; i < count; i++) {
    const m = list[i];
    const a = rng.range(0, Math.PI * 2);
    game.pounces.push({ x: m.pos.x, y: m.pos.y, a, t: 0, dur: 0.35 });
    // Heavy per bite, because there are only a handful of bites: the others
    // sweep a circle and are paid by how crowded it is, and this one is paid
    // by nothing at all — it takes the same five throats in a crowd of fifty.
    strike(game, m, 2.2 * dmgOf('wolfDmg'), 'wolf');
    // Hamstrung: the bite is worth as much for what it stops as what it takes.
    applySlow(m, 0.4, 1.6);
  }
}

/**
 * One blow, in the middle of them. Everything standing is thrown outward and
 * left reeling — the only one of the four that buys you room rather than kills.
 */
function bear(game, p, dt) {
  const r = rank(p, 'bear');
  game.slams ??= [];
  for (let i = game.slams.length - 1; i >= 0; i--) {
    game.slams[i].t += dt;
    if (game.slams[i].t >= game.slams[i].dur) game.slams.splice(i, 1);
  }
  if (r <= 0) return;
  if (!due(game, 'bear', dt, ANIMAL_CD / rateOf('bearRate'))) return;
  const radius = T.bearSize + r * 14;
  const at = thickest(game, p, 520, radius);
  if (!at) { game.cd.bear = 0.4; return; }
  game.slams.push({ x: at.x, y: at.y, t: 0, dur: 0.5, r: radius });
  game.novas.push({ x: at.x, y: at.y, t: 0, dur: 0.45, r: radius, color: '#c9a882' });
  for (const m of near(game, at.x, at.y, radius)) {
    strike(game, m, 0.75 * dmgOf('bearDmg'), 'bear');
    const dx = m.pos.x - at.x, dy = m.pos.y - at.y;
    const d = Math.hypot(dx, dy) || 1;
    m.vel.x += (dx / d) * T.bearKnock;
    m.vel.y += (dy / d) * T.bearKnock;
    applyStun(m, 0.5 + r * 0.08);
  }
  burst(at.x, at.y, 26, { color: '#b9a288', speed: 260, life: 0.6, size: 3 });
}

/**
 * It crosses the whole field without stopping. Aimed through the crowd rather
 * than at it, so it is worth the most when they are strung out in a line.
 */
function elk(game, p, dt) {
  const r = rank(p, 'elk');
  game.charges ??= [];
  for (let i = game.charges.length - 1; i >= 0; i--) {
    const c = game.charges[i];
    c.x += Math.cos(c.a) * c.speed * dt;
    c.y += Math.sin(c.a) * c.speed * dt;
    c.t += dt;
    if (c.t >= c.dur) { game.charges.splice(i, 1); continue; }
    for (const m of near(game, c.x, c.y, c.r)) {
      if (c.hit.includes(m)) continue;
      c.hit.push(m);
      strike(game, m, 0.6 * dmgOf('elkDmg'), 'elk');
      // Shouldered aside rather than run down: it is going somewhere.
      const side = Math.sign((m.pos.x - c.x) * -Math.sin(c.a) + (m.pos.y - c.y) * Math.cos(c.a)) || 1;
      m.vel.x += -Math.sin(c.a) * side * 260;
      m.vel.y += Math.cos(c.a) * side * 260;
    }
  }
  if (r <= 0) return;
  if (!due(game, 'elk', dt, ANIMAL_CD / rateOf('elkRate'))) return;
  const at = thickest(game, p, 560, 120);
  if (!at) { game.cd.elk = 0.4; return; }
  // Enters from off screen, passes through the crowd, and leaves on the far side.
  const a = rng.range(0, Math.PI * 2);
  const lead = 780;
  const speed = T.elkSpeed;
  game.charges.push({
    x: at.x - Math.cos(a) * lead, y: at.y - Math.sin(a) * lead,
    a, speed, t: 0, dur: (lead * 2) / speed, r: T.elkSize + r * 6,
    /** @type {any[]} */ hit: [],
  });
}

/**
 * Counts one weapon's cooldown down and reports when it comes due.
 * @param {any} game @param {string} id @param {number} dt @param {number} period
 */
function due(game, id, dt, period) {
  game.cd[id] -= dt;
  if (game.cd[id] > 0) return false;
  game.cd[id] = period;
  return true;
}

/** Live monsters within `r` of a point, nearest first is not guaranteed. */
function near(game, x, y, r) {
  /** @type {any[]} */
  const out = [];
  for (const m of game.monsters) {
    if (m.dead || m.dormant) continue;
    if (Math.abs(m.pos.x - x) > r || Math.abs(m.pos.y - y) > r) continue;
    if (Math.hypot(m.pos.x - x, m.pos.y - y) > r) continue;
    out.push(m);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Steel                                                               */
/* ------------------------------------------------------------------ */

/**
 * A ring that turns with you at its centre. It hits on contact rather than on a
 * timer, so where you stand decides what it catches.
 */
function axes(game, p, dt) {
  const r = rank(p, 'axes');
  if (r <= 0) { game.axes = []; return; }
  const count = 1 + Math.floor(r / 2);
  const radius = T.axeRadius + r * 6;
  game.autoSpin = (game.autoSpin + (2.0 + r * 0.18) * rateOf('axesRate') * dt) % (Math.PI * 2);

  game.axes = [];
  for (let i = 0; i < count; i++) {
    const a = game.autoSpin + (i / count) * Math.PI * 2;
    game.axes.push({ x: p.pos.x + Math.cos(a) * radius, y: p.pos.y + Math.sin(a) * radius, a });
  }
  for (const m of near(game, p.pos.x, p.pos.y, radius + 80)) {
    m.axeCd = Math.max(0, (m.axeCd ?? 0) - dt);
    if (m.axeCd > 0) continue;
    for (const ax of game.axes) {
      if (Math.hypot(m.pos.x - ax.x, m.pos.y - ax.y) > T.axesReach + m.radius) continue;
      m.axeCd = 0.62;
      strike(game, m, 0.18 * dmgOf('axesDmg'), 'axes');
      burst(ax.x, ax.y, 4, { color: '#d6e2f2', speed: 90, life: 0.25, size: 1.8 });
      break;
    }
  }
}

/** Thrown at whatever you can see, on its own. */
function javelins(game, p, dt) {
  const r = rank(p, 'javelin');
  game.javelins ??= [];
  if (r > 0 && due(game, 'javelin', dt, 0)) {
    game.cd.javelin = 0;
    if (game.cd.javelinT === undefined) game.cd.javelinT = 0;
  }
  // Its own timer, so an empty screen costs nothing: the cooldown only starts
  // once it actually throws.
  game.cd.javelin -= dt;
  if (r > 0 && game.cd.javelin <= 0) {
    const list = near(game, p.pos.x, p.pos.y, 380 + r * 24);
    /** @type {any} */
    let best = null; let bd = Infinity;
    for (const m of list) {
      const d = Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y);
      if (d < bd) { bd = d; best = m; }
    }
    // One line-of-sight test, on the nearest. Tracing a line is not cheap and
    // there can be hundreds of monsters loaded.
    if (best && !losBlocked(game.world, p.pos.x, p.pos.y, best.pos.x, best.pos.y)) {
      game.cd.javelin = Math.max(0.85, 2.5 - r * 0.28) / rateOf('javRate');
      const a = Math.atan2(best.pos.y - p.pos.y, best.pos.x - p.pos.x);
      game.javelins.push({
        x: p.pos.x, y: p.pos.y - 8, a,
        vx: Math.cos(a) * T.javSpeed, vy: Math.sin(a) * T.javSpeed,
        life: 1.1, pierce: r >= 2 ? 2 : 1, /** @type {any[]} */ hit: [],
      });
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
      strike(game, m, 0.50 * dmgOf('javDmg'), 'javelin');
      if (j.hit.length >= j.pierce) { game.javelins.splice(i, 1); break; }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The elements                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lightning, out of the sky, on whatever it likes. The only one that hits a
 * crowd rather than a body — which is why it hits so lightly per head.
 */
function thunder(game, p, dt) {
  const r = rank(p, 'thunder');
  game.bolts ??= [];
  for (let i = game.bolts.length - 1; i >= 0; i--) {
    game.bolts[i].t += dt;
    if (game.bolts[i].t >= game.bolts[i].dur) game.bolts.splice(i, 1);
  }
  if (r <= 0) return;
  if (!due(game, 'thunder', dt, Math.max(0.7, 2.8 - r * 0.32) / rateOf('boltRate'))) return;

  const list = near(game, p.pos.x, p.pos.y, T.boltRange + r * 30);
  if (!list.length) { game.cd.thunder = 0.15; return; }
  const at = list[Math.floor(rng.next() * list.length)];
  const radius = T.boltSize + r * 3;
  game.bolts.push({ x: at.pos.x, y: at.pos.y, t: 0, dur: 0.42, r: radius });
  game.novas.push({ x: at.pos.x, y: at.pos.y, t: 0, dur: 0.4, r: radius, color: '#d7c2ff' });
  for (const m of near(game, at.pos.x, at.pos.y, radius + 24)) {
    strike(game, m, 0.075 * dmgOf('boltDmg'), 'thunder', 'light');
  }
  burst(at.pos.x, at.pos.y, 12, { color: '#e2d4ff', speed: 210, life: 0.45, size: 2.6, grav: -40 });
}

/**
 * Fire: the ground burns where you have walked.
 *
 * The only one that pays you for *moving*, which is the thing the rest of the
 * combat already wants from you. Standing still lays one patch and then nothing.
 */
function ember(game, p, dt) {
  const r = rank(p, 'ember');
  game.embers ??= [];
  for (let i = game.embers.length - 1; i >= 0; i--) {
    const e = game.embers[i];
    e.t += dt;
    if (e.t >= e.dur) { game.embers.splice(i, 1); continue; }
    for (const m of near(game, e.x, e.y, e.r + 20)) {
      m.emberCd = Math.max(0, (m.emberCd ?? 0) - dt / Math.max(1, game.embers.length));
      if (m.emberCd > 0) continue;
      m.emberCd = 0.45;
      strike(game, m, 0.055 * dmgOf('emberDmg'), 'ember', 'fire');
    }
  }
  if (r <= 0) return;
  if (!p.moving) return;
  if (!due(game, 'ember', dt, 0.2 / rateOf('emberRate'))) return;
  game.embers.push({
    x: p.pos.x, y: p.pos.y, t: 0,
    dur: T.emberLife + r * 0.45, r: T.emberSize + r * 4,
  });
  if (game.embers.length > 40) game.embers.shift();
}

/**
 * Water, stopped: a ring of cold opening out of you.
 *
 * The defensive one. Its damage is small and its slow is the point — it buys
 * you the step you need rather than killing anything.
 */
function frost(game, p, dt) {
  const r = rank(p, 'frost');
  game.rings ??= [];
  for (let i = game.rings.length - 1; i >= 0; i--) {
    const g = game.rings[i];
    const was = g.at;
    g.t += dt;
    g.at = (g.t / g.dur) * g.r;
    // The wave catches what it sweeps past, once each.
    for (const m of near(game, g.x, g.y, g.at + 30)) {
      if (g.hit.includes(m)) continue;
      const d = Math.hypot(m.pos.x - g.x, m.pos.y - g.y);
      if (d < was - 20 || d > g.at + m.radius) continue;
      g.hit.push(m);
      strike(game, m, 0.09 * dmgOf('frostDmg'), 'frost', 'cold');
      applySlow(m, Math.min(0.9, (0.22 + g.rank * 0.05) * T.frostSlow), 1.2 + g.rank * 0.25);
    }
    if (g.t >= g.dur) game.rings.splice(i, 1);
  }
  if (r <= 0) return;
  if (!due(game, 'frost', dt, Math.max(1.1, 3.4 - r * 0.38) / rateOf('frostRate'))) return;
  const radius = T.frostSize + r * 26;
  game.rings.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.5, r: radius, at: 0, rank: r, hit: [] });
  game.novas.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.5, r: radius, color: '#8fd8f4' });
}

/**
 * Earth: a boulder that rolls away from you and ploughs a line.
 *
 * The only one whose worth depends on where you are *facing*, so it is the one
 * that rewards lining a pack up before you let it go.
 */
function cairn(game, p, dt) {
  const r = rank(p, 'cairn');
  game.boulders ??= [];
  for (let i = game.boulders.length - 1; i >= 0; i--) {
    const b = game.boulders[i];
    const px = b.x, py = b.y;
    b.x += Math.cos(b.a) * b.speed * dt;
    b.y += Math.sin(b.a) * b.speed * dt;
    b.spin += dt * 6;
    b.life -= dt;
    if (b.life <= 0 || losBlocked(game.world, px, py, b.x, b.y)) {
      burst(b.x, b.y, 14, { color: '#8b93a4', speed: 150, life: 0.5, size: 2.6 });
      game.boulders.splice(i, 1);
      continue;
    }
    for (const m of near(game, b.x, b.y, b.r + 28)) {
      if (b.hit.includes(m)) continue;
      b.hit.push(m);
      // A boulder sweeps a whole line and never hits the same body twice, so it
      // is worth far more per point than anything that strikes once. At 0.42 it
      // was doing half of all the damage on its own.
      strike(game, m, 0.15 * dmgOf('cairnDmg'), 'cairn');
      // Shoved aside as it goes past, so a line of them scatters.
      m.vel.x += Math.cos(b.a) * 180;
      m.vel.y += Math.sin(b.a) * 180;
    }
  }
  if (r <= 0) return;
  if (!due(game, 'cairn', dt, Math.max(1.2, 3.6 - r * 0.4) / rateOf('cairnRate'))) return;
  const n = r >= 3 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const spread = n === 1 ? 0 : (i - 0.5) * 0.5;
    game.boulders.push({
      x: p.pos.x, y: p.pos.y, a: p.facing + spread, spin: 0,
      speed: T.cairnSpeed, life: 1.5 + r * 0.12, r: T.cairnSize + r * 2,
      /** @type {any[]} */ hit: [],
    });
  }
}

/**
 * Air: a wind that wanders off and drags what it passes into itself.
 *
 * It gathers a pack rather than killing one, which is what makes it worth
 * having next to anything that hits a crowd.
 */
function gale(game, p, dt) {
  const r = rank(p, 'gale');
  game.gales ??= [];
  for (let i = game.gales.length - 1; i >= 0; i--) {
    const w = game.gales[i];
    w.t += dt;
    w.a += w.turn * dt;
    w.x += Math.cos(w.a) * w.speed * dt;
    w.y += Math.sin(w.a) * w.speed * dt;
    w.spin += dt * 5;
    if (w.t >= w.dur) { game.gales.splice(i, 1); continue; }
    for (const m of near(game, w.x, w.y, w.r)) {
      const dx = w.x - m.pos.x, dy = w.y - m.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      m.pos.x += (dx / d) * w.pull * dt;
      m.pos.y += (dy / d) * w.pull * dt;
      m.galeCd = Math.max(0, (m.galeCd ?? 0) - dt);
      if (m.galeCd > 0) continue;
      m.galeCd = 0.5;
      strike(game, m, 0.10 * dmgOf('galeDmg'), 'gale');
    }
  }
  if (r <= 0) return;
  if (!due(game, 'gale', dt, Math.max(2.2, 6.5 - r * 0.7) / rateOf('galeRate'))) return;
  game.gales.push({
    x: p.pos.x, y: p.pos.y, a: p.facing + rng.range(-0.5, 0.5), spin: 0,
    turn: rng.range(-0.7, 0.7), speed: 110, pull: T.galePull + r * 8,
    t: 0, dur: 3.5 + r * 0.5, r: T.galeSize + r * 9,
  });
}
