// @ts-check
import { rng } from '../core/rng.js';
import { angleDiff } from '../core/math.js';
import { damagePlayer, applySlow } from './combat.js';
import { createMonster } from '../entities/monster.js';
import { MONSTERS } from '../data/monsters.js';
import { burst, shake, screenFlash, floatText } from '../render/fx.js';
import { resolveCollision } from './world.js';

/** @typedef {import('../entities/monster.js').Monster} Monster */

/**
 * Jarl Hravns AI.
 *
 * Bossen kör en egen loop i stället för det vanliga monstermönstret, av två skäl:
 *  1. Den vanliga separationskraften från livvakterna kunde överrösta jaktvektorn,
 *     så att bossen puttades runt utan att någonsin komma inom räckhåll.
 *  2. En boss ska ha *läsbara* attacker. Varje move har en telegraf som ritas på
 *     marken innan den träffar, så att den som ser upp kan gå undan.
 */

const MOVES = {
  sweep:  { name: 'Frostsvep',      wind: 0.75, cd: 2.6, range: 130, mult: 1.00 },
  slam:   { name: 'Iskross',        wind: 1.10, cd: 4.2, range: 340, mult: 1.35 },
  charge: { name: 'Rimlans',        wind: 0.90, cd: 5.5, range: 620, mult: 1.15 },
  summon: { name: 'Kallar vålnader', wind: 1.20, cd: 99,  range: 999, mult: 0 },
};

/** @param {Monster} m */
function state(m) {
  if (!m.bossState) {
    m.bossState = {
      cd: 1.8, /** @type {keyof MOVES|null} */ move: null, t: 0, dur: 0,
      aim: { x: 0, y: 0 }, dir: 0, summons: 0,
      /** @type {null|{t:number, dir:number, hit:Set<number>}} */ charge: null,
      /** @type {Record<string, number>} */ moveCd: { sweep: 0, slam: 1.5, charge: 3 },
    };
  }
  return m.bossState;
}

/**
 * @param {any} game @param {Monster} m @param {number} dt
 * @returns {{mx:number, my:number, handled:boolean}} rörelse som ai.js ska applicera
 */
export function updateBoss(game, m, dt) {
  const p = game.player;
  const B = state(m);
  const dx = p.pos.x - m.pos.x, dy = p.pos.y - m.pos.y;
  const dist = Math.hypot(dx, dy) || 0.001;

  for (const k in B.moveCd) B.moveCd[k] = Math.max(0, B.moveCd[k] - dt);

  // Frusen eller bedövad: allt pausar, även pågående telegraf.
  if (m.freezeT > 0 || m.stunT > 0) return { mx: 0, my: 0, handled: true };

  // ---- pågående rusning ---------------------------------------------------
  if (B.charge) {
    B.charge.t -= dt;
    const sp = 720;
    m.pos.x += Math.cos(B.charge.dir) * sp * dt;
    m.pos.y += Math.sin(B.charge.dir) * sp * dt;
    resolveCollision(game.zone, m.pos, m.radius);
    burst(m.pos.x, m.pos.y, 3, { color: '#a8e4f8', speed: 60, life: 0.4, size: 3, grav: 10 });
    if (!B.charge.hit.has(0) && dist < m.radius + p.radius + 22) {
      B.charge.hit.add(0);
      damagePlayer(game, rng.range(m.dmgMin, m.dmgMax) * MOVES.charge.mult, m);
      shake(9);
    }
    if (B.charge.t <= 0) { B.charge = null; B.cd = 1.1; }
    return { mx: 0, my: 0, handled: true };
  }

  // ---- pågående telegraf --------------------------------------------------
  if (B.move) {
    B.t -= dt;
    if (m.telegraph) m.telegraph.t = 1 - B.t / B.dur;
    if (B.t <= 0) {
      execute(game, m, B, B.move);
      B.move = null;
      m.telegraph = null;
      B.cd = 1.0;
    }
    return { mx: 0, my: 0, handled: true };
  }

  // ---- fasbyten: kalla fram vålnader vid 66% och 33% ----------------------
  const frac = m.hp / m.maxHp;
  const wantSummons = frac < 0.34 ? 2 : frac < 0.67 ? 1 : 0;
  if (wantSummons > B.summons) {
    B.summons = wantSummons;
    begin(m, B, 'summon');
    return { mx: 0, my: 0, handled: true };
  }

  // ---- välj nästa move ----------------------------------------------------
  B.cd -= dt;
  if (B.cd <= 0 && dist < 700) {
    /** @type {(keyof MOVES)[]} */
    const options = [];
    if (B.moveCd.sweep <= 0 && dist < MOVES.sweep.range) options.push('sweep');
    if (B.moveCd.slam <= 0 && dist < MOVES.slam.range) options.push('slam');
    if (B.moveCd.charge <= 0 && dist > 180 && dist < MOVES.charge.range) options.push('charge');
    if (options.length) {
      begin(m, B, rng.pick(options), p);
      return { mx: 0, my: 0, handled: true };
    }
  }

  // ---- annars: gå mot spelaren -------------------------------------------
  m.facing = Math.atan2(dy, dx);
  if (dist > 90) return { mx: dx / dist, my: dy / dist, handled: true };
  return { mx: 0, my: 0, handled: true };
}

/**
 * @param {Monster} m @param {any} B @param {keyof MOVES} move @param {any} [p]
 */
function begin(m, B, move, p) {
  const def = MOVES[move];
  B.move = move;
  B.t = def.wind;
  B.dur = def.wind;
  B.moveCd[move] = def.cd + def.wind;
  if (p) {
    B.dir = Math.atan2(p.pos.y - m.pos.y, p.pos.x - m.pos.x);
    m.facing = B.dir;
    // Iskrossen siktar där spelaren *är* — går man därifrån missar den.
    B.aim = { x: p.pos.x, y: p.pos.y };
  }
  m.telegraph = move === 'sweep'
    ? { kind: 'arc', t: 0, x: m.pos.x, y: m.pos.y, r: MOVES.sweep.range, dir: B.dir, arc: Math.PI, color: '#8fd8f4', label: def.name }
    : move === 'slam'
      ? { kind: 'circle', t: 0, x: B.aim.x, y: B.aim.y, r: 175, color: '#8fd8f4', label: def.name }
      : move === 'charge'
        ? { kind: 'line', t: 0, x: m.pos.x, y: m.pos.y, r: 640, dir: B.dir, width: 74, color: '#a8e4f8', label: def.name }
        : { kind: 'circle', t: 0, x: m.pos.x, y: m.pos.y, r: 220, color: '#9a7ad0', label: def.name };
}

/** @param {any} game @param {Monster} m @param {any} B @param {keyof MOVES} move */
function execute(game, m, B, move) {
  const p = game.player;
  const def = MOVES[move];
  const dmg = () => rng.range(m.dmgMin, m.dmgMax) * def.mult;

  if (move === 'sweep') {
    const dx = p.pos.x - m.pos.x, dy = p.pos.y - m.pos.y;
    const d = Math.hypot(dx, dy);
    game.novas.push({ x: m.pos.x, y: m.pos.y, t: 0, dur: 0.3, r: MOVES.sweep.range, color: '#8fd8f4' });
    burst(m.pos.x + Math.cos(B.dir) * 60, m.pos.y + Math.sin(B.dir) * 60, 26,
      { color: '#cfeeff', speed: 300, life: 0.5, size: 3, dir: B.dir, spread: Math.PI, shape: 'shard' });
    if (d < MOVES.sweep.range + p.radius && angleDiff(Math.atan2(dy, dx), B.dir) < Math.PI / 2) {
      damagePlayer(game, dmg(), m);
    }
    shake(7);

  } else if (move === 'slam') {
    game.novas.push({ x: B.aim.x, y: B.aim.y, t: 0, dur: 0.45, r: 175, color: '#a8e4f8' });
    burst(B.aim.x, B.aim.y, 46, { color: '#dff4ff', speed: 340, life: 0.7, size: 3.4, shape: 'shard' });
    if (Math.hypot(p.pos.x - B.aim.x, p.pos.y - B.aim.y) < 175 + p.radius) {
      damagePlayer(game, dmg(), m);
      p.slamSlowT = 2.5;
    }
    for (const o of game.monsters) {
      if (o === m || o.dead) continue;
      if (Math.hypot(o.pos.x - B.aim.x, o.pos.y - B.aim.y) < 175) applySlow(o, 0.2, 1);
    }
    shake(12);
    screenFlash(0.14, '#7fd4f0');

  } else if (move === 'charge') {
    B.charge = { t: 0.55, dir: B.dir, hit: new Set() };
    shake(5);

  } else {
    // Vålnader ur snön
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(0, 1);
      const x = m.pos.x + Math.cos(a) * 150, y = m.pos.y + Math.sin(a) * 150;
      game.monsters.push(createMonster(MONSTERS[3], m.level - 1, x, y, {}));
      burst(x, y, 26, { color: '#9a7ad0', speed: 200, life: 0.8, size: 3, grav: -40 });
    }
    game.novas.push({ x: m.pos.x, y: m.pos.y, t: 0, dur: 0.6, r: 220, color: '#9a7ad0' });
    floatText(m.pos.x, m.pos.y - m.radius - 30, 'Vålnader!', '#c4a8f0', 15);
    shake(8);
  }
}
