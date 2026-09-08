// @ts-check
import { rng } from '../core/rng.js';
import { resolveCollision, lineBlocked } from './world.js';
import { damagePlayer, hitMonster, applySlow } from './combat.js';
import { burst, floatText } from '../render/fx.js';
import { rank } from './stats.js';
import { updateBoss } from './boss.js';
import { T } from './tuning.js';

/** @typedef {import('../entities/monster.js').Monster} Monster */

const AGGRO_FAR_MULT = 1.9;
/** A little slack on the touch test, so contact is generous rather than fussy. */
const CONTACT_PAD = 2;

/** How close a monster has to be to be *touching* you. @param {Monster} m @param {any} p */
const contactDist = (m, p) => m.radius + p.radius + CONTACT_PAD;

// Aggro is a feel knob: how much room you get to choose your fight.
const aggro = () => T.aggro;
const aggroFar = () => T.aggro * AGGRO_FAR_MULT;

/**
 * @param {any} game @param {number} dt
 */
export function updateMonsters(game, dt) {
  const p = game.player;
  const zone = game.zone;
  const rimeR = rank(p, 'rimeaura');

  for (let i = game.monsters.length - 1; i >= 0; i--) {
    const m = game.monsters[i];

    if (m.dead) {
      m.telegraph = null;
      m.corpseT -= dt;
      if (m.corpseT <= 0) game.monsters.splice(i, 1);
      continue;
    }

    // ---- statusar -------------------------------------------------------
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    if (m.slowT > 0) { m.slowT -= dt; if (m.slowT <= 0) m.slowAmt = 0; }
    if (m.freezeT > 0) m.freezeT -= dt;
    if (m.stunT > 0) m.stunT -= dt;
    if (m.bleed) {
      m.bleed.t -= dt;
      m.dotAcc = (m.dotAcc ?? 0) + m.bleed.dps * dt;
      if (m.dotAcc >= 1) {
        const n = Math.floor(m.dotAcc); m.dotAcc -= n;
        hitMonster(game, m, { phys: n, ignoreArmor: true, silent: true });
        if (rng.chance(0.35)) burst(m.pos.x, m.pos.y, 2, { color: '#a8202a', speed: 40, life: 0.5, size: 2 });
      }
      if (m.bleed.t <= 0) m.bleed = null;
    }
    if (m.dead) { m.telegraph = null; continue; }

    const dx = p.pos.x - m.pos.x, dy = p.pos.y - m.pos.y;
    const dist = Math.hypot(dx, dy) || 0.001;

    // Rimfrostaura: passiv skada + slow runt spelaren
    if (rimeR > 0 && dist < 150 + m.radius) {
      applySlow(m, Math.min(0.12 + rimeR * 0.03, 0.45), 0.4);
      m.rimeAcc = (m.rimeAcc ?? 0) + (1 + rimeR * 0.9) * dt;
      if (m.rimeAcc >= 1) {
        const n = Math.floor(m.rimeAcc); m.rimeAcc -= n;
        hitMonster(game, m, { cold: n, silent: true });
      }
      if (m.dead) continue;
    }
    // The elite's frost aura on the player
    if (m.auraSlow && dist < 190) game.playerSlow = Math.max(game.playerSlow, m.auraSlow);

    const frozen = m.freezeT > 0 || m.stunT > 0;
    const speedMult = (1 - m.slowAmt) * (frozen ? 0 : 1) * T.monSpeed;

    // The boss runs its own loop and stands outside separation — otherwise the
    // bodyguards could shove it away from the player forever.
    if (m.isBoss) {
      const b = updateBoss(game, m, dt);
      const bl = Math.hypot(b.mx, b.my);
      if (bl > 0.001) {
        const sp = m.speed * speedMult;
        m.pos.x += (b.mx / bl) * sp * dt;
        m.pos.y += (b.my / bl) * sp * dt;
        m.walk = (m.walk ?? 0) + dt * sp * 0.05;
      }
      resolveCollision(zone, m.pos, m.radius);
      continue;
    }

    // Dormant: stands and waits. Only a hit wakes it.
    if (m.dormant) { resolveCollision(zone, m.pos, m.radius); continue; }

    // ---- aggro ----------------------------------------------------------
    if (m.state === 'idle') {
      if (dist < aggro() && !p.dead) m.state = 'chase';
    } else if (dist > aggroFar() || p.dead) {
      m.state = 'idle';
    }

    m.cd -= dt;
    // Only the archers draw back now. Freezing or stunning one mid-draw stops
    // it: a shot that comes out of something you just froze is the game's
    // fault, and it should never be the game's fault.
    if (m.windup > 0 && !frozen) {
      m.windup -= dt;
      if (m.windup <= 0) fireShot(game, m);
    }

    let mx = 0, my = 0;
    if (m.state === 'idle') {
      // Wander slowly — makes the world feel alive without drawing attention
      m.wanderT -= dt;
      if (m.wanderT <= 0) { m.wanderT = rng.range(1.5, 4); m.wanderDir = rng.range(0, Math.PI * 2); }
      mx = Math.cos(m.wanderDir) * 0.28; my = Math.sin(m.wanderDir) * 0.28;
    } else if (m.windup <= 0) {
      if (m.ai === 'ranged') {
        // Closes until the shot is on and then holds. It never gives ground:
        // walking at an archer has to be worth something, and an enemy that
        // backs away while you advance turns every fight into a chase.
        const want = m.attackRange * 0.72;
        if (dist > want) { mx = dx / dist; my = dy / dist; }
        if (m.cd <= 0 && dist < m.attackRange
            && !lineBlocked(zone, m.pos.x, m.pos.y, p.pos.x, p.pos.y)) {
          // The aim is locked at the draw, not at the shot, so stepping sideways
          // works: the arrow goes where you *were*.
          m.windup = T.rangedWindup;
          m.facing = Math.atan2(dy, dx);
        }
      } else {
        // Everything else simply walks into you and stays there. It has no
        // swing to time and nothing to step out of — being in contact with it
        // is the danger, so the answer is to not be.
        if (dist > contactDist(m, p)) {
          mx = dx / dist; my = dy / dist;
          // Charger: short lunges that make them dangerous in open ground
          if (m.ai === 'charger') {
            m.lungeCd -= dt;
            if (m.lungeT > 0) { m.lungeT -= dt; mx *= 2.5; my *= 2.5; }
            else if (m.lungeCd <= 0 && dist < 300 && dist > 90) { m.lungeT = 0.45; m.lungeCd = rng.range(2.5, 5); }
          }
        }
      }
    }

    // ---- separation: monsters should not stack on top of each other ------
    // The force is capped: otherwise a dense pack can push its own members
    // away from the target instead of surrounding it.
    let sx = 0, sy = 0;
    for (const o of game.monsters) {
      if (o === m || o.dead) continue;
      const ox = m.pos.x - o.pos.x, oy = m.pos.y - o.pos.y;
      const od = Math.hypot(ox, oy);
      const minD = m.radius + o.radius;
      if (od < minD && od > 0.001) {
        const push = (minD - od) / minD;
        sx += (ox / od) * push;
        sy += (oy / od) * push;
      }
    }
    const sl = Math.hypot(sx, sy);
    const cap = m.state === 'idle' ? 1 : 0.75;
    if (sl > cap) { sx = (sx / sl) * cap; sy = (sy / sl) * cap; }
    mx += sx; my += sy;

    const len = Math.hypot(mx, my);
    if (len > 0.001) {
      const sp = m.speed * speedMult;
      m.pos.x += (mx / len) * sp * dt;
      m.pos.y += (my / len) * sp * dt;
      // Not while a blow is on its way: the tell showed a direction, and a
      // monster shoved sideways by its own pack must not quietly re-aim it.
      if (m.state !== 'idle' && m.windup <= 0) m.facing = Math.atan2(dy, dx);
      m.walk = (m.walk ?? 0) + dt * sp * 0.05;
    }
    // knockback-hastighet
    m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt;
    m.vel.x *= Math.pow(0.0005, dt); m.vel.y *= Math.pow(0.0005, dt);

    resolveCollision(zone, m.pos, m.radius);

    // Touching hurts. Measured after the move, so what is on screen is what is
    // tested, and the cooldown means a monster in contact wears you down at a
    // readable pace rather than melting you in a frame.
    if (m.ai !== 'ranged' && !frozen && !p.dead && m.cd <= 0
        && Math.hypot(p.pos.x - m.pos.x, p.pos.y - m.pos.y) <= contactDist(m, p)) {
      touchPlayer(game, m);
    }
  }
}

/**
 * The archer's shot, fired along the direction locked when it drew.
 * @param {any} game @param {Monster} m
 */
function fireShot(game, m) {
  m.cd = m.attackCd;
  if (game.player.dead) return;
  const a = m.facing;
  game.projectiles.push({
    x: m.pos.x + Math.cos(a) * m.radius, y: m.pos.y + Math.sin(a) * m.radius,
    vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 1.6, r: 5,
    dmg: rng.range(m.dmgMin, m.dmgMax) * T.dmgMult, src: m,
  });
}

/**
 * Running into something is the whole attack.
 * @param {any} game @param {Monster} m
 */
function touchPlayer(game, m) {
  const p = game.player;
  m.cd = m.attackCd;
  const before = p.hp;
  damagePlayer(game, rng.range(m.dmgMin, m.dmgMax) * T.dmgMult, m);
  if (m.lifeSteal) {
    const healed = Math.min(m.maxHp - m.hp, (before - p.hp) * m.lifeSteal);
    if (healed > 0) { m.hp += healed; floatText(m.pos.x, m.pos.y - m.radius, `+${Math.round(healed)}`, '#7ce39a', 11); }
  }
}

/** @param {any} game @param {number} dt */
export function updateProjectiles(game, dt) {
  const p = game.player;
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const pr = game.projectiles[i];
    const px = pr.x, py = pr.y;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0) { game.projectiles.splice(i, 1); continue; }
    if (lineBlocked(game.zone, px, py, pr.x, pr.y)) {
      burst(pr.x, pr.y, 6, { color: '#b6c2d4', speed: 90, life: 0.3, size: 2 });
      game.projectiles.splice(i, 1);
      continue;
    }
    if (!p.dead && Math.hypot(pr.x - p.pos.x, pr.y - p.pos.y) < p.radius + pr.r) {
      damagePlayer(game, pr.dmg, pr.src);
      burst(pr.x, pr.y, 8, { color: '#c8b48a', speed: 120, life: 0.35, size: 2 });
      game.projectiles.splice(i, 1);
    }
  }
}
