// @ts-check
import { rng } from '../core/rng.js';
import { resolveCollision, lineBlocked } from './world.js';
import { damagePlayer, hitMonster, applySlow } from './combat.js';
import { burst, floatText } from '../render/fx.js';
import { rank } from './stats.js';
import { updateBoss } from './boss.js';

/** @typedef {import('../entities/monster.js').Monster} Monster */

const AGGRO = 470;
const AGGRO_FAR = 900; // när de väl blivit arga följer de längre

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
    if (m.dead) continue;

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
    // Elitens frostaura mot spelaren
    if (m.auraSlow && dist < 190) game.playerSlow = Math.max(game.playerSlow, m.auraSlow);

    const frozen = m.freezeT > 0 || m.stunT > 0;
    const speedMult = (1 - m.slowAmt) * (frozen ? 0 : 1);

    // Bossen kör sin egen loop och står utanför separationen — annars kunde
    // livvakterna putta bort den från spelaren i all oändlighet.
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

    // Sovande: står kvar och väntar. Väcks först av en träff.
    if (m.dormant) { resolveCollision(zone, m.pos, m.radius); continue; }

    // ---- aggro ----------------------------------------------------------
    if (m.state === 'idle') {
      if (dist < AGGRO && !p.dead) m.state = 'chase';
    } else if (dist > AGGRO_FAR || p.dead) {
      m.state = 'idle';
    }

    m.cd -= dt;
    if (m.windup > 0) {
      m.windup -= dt;
      if (m.windup <= 0) resolveMonsterAttack(game, m, dist);
    }

    let mx = 0, my = 0;
    if (m.state === 'idle') {
      // Vandra långsamt omkring — gör världen levande utan att dra uppmärksamhet
      m.wanderT -= dt;
      if (m.wanderT <= 0) { m.wanderT = rng.range(1.5, 4); m.wanderDir = rng.range(0, Math.PI * 2); }
      mx = Math.cos(m.wanderDir) * 0.28; my = Math.sin(m.wanderDir) * 0.28;
    } else if (m.windup <= 0) {
      if (m.ai === 'ranged') {
        // Håll avstånd: närma dig om för långt, backa om för nära
        const want = m.attackRange * 0.72;
        const k = dist < want * 0.6 ? -1 : dist > want ? 1 : 0;
        mx = (dx / dist) * k; my = (dy / dist) * k;
        if (m.cd <= 0 && dist < m.attackRange
            && !lineBlocked(zone, m.pos.x, m.pos.y, p.pos.x, p.pos.y)) {
          m.windup = 0.45; m.facing = Math.atan2(dy, dx);
        }
      } else {
        if (dist > m.attackRange + m.radius * 0.4) {
          mx = dx / dist; my = dy / dist;
          // Charger: korta utfall som gör dem farliga i öppen terräng
          if (m.ai === 'charger') {
            m.lungeCd -= dt;
            if (m.lungeT > 0) { m.lungeT -= dt; mx *= 2.5; my *= 2.5; }
            else if (m.lungeCd <= 0 && dist < 300 && dist > 90) { m.lungeT = 0.45; m.lungeCd = rng.range(2.5, 5); }
          }
        } else if (m.cd <= 0) {
          m.windup = m.isBoss ? 0.5 : 0.35;
          m.facing = Math.atan2(dy, dx);
        }
      }
    }

    // ---- separation: monster ska inte stapla på varandra ----------------
    // Kraften taklistas: annars kan en tät flock trycka bort sina egna
    // medlemmar från målet i stället för att omringa det.
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
      if (m.state !== 'idle') m.facing = Math.atan2(dy, dx);
      m.walk = (m.walk ?? 0) + dt * sp * 0.05;
    }
    // knockback-hastighet
    m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt;
    m.vel.x *= Math.pow(0.0005, dt); m.vel.y *= Math.pow(0.0005, dt);

    resolveCollision(zone, m.pos, m.radius);
  }
}

/** @param {any} game @param {Monster} m @param {number} dist */
function resolveMonsterAttack(game, m, dist) {
  const p = game.player;
  m.cd = m.attackCd;
  if (p.dead) return;

  if (m.ai === 'ranged') {
    const a = Math.atan2(p.pos.y - m.pos.y, p.pos.x - m.pos.x);
    game.projectiles.push({
      x: m.pos.x + Math.cos(a) * m.radius, y: m.pos.y + Math.sin(a) * m.radius,
      vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 1.6, r: 5,
      dmg: rng.range(m.dmgMin, m.dmgMax), src: m,
    });
    return;
  }

  if (dist > m.attackRange + p.radius + 14) return; // spelaren hann undan
  const dmg = rng.range(m.dmgMin, m.dmgMax);
  const before = p.hp;
  damagePlayer(game, dmg, m);
  if (m.lifeSteal) {
    const healed = Math.min(m.maxHp - m.hp, (before - p.hp) * m.lifeSteal);
    if (healed > 0) { m.hp += healed; floatText(m.pos.x, m.pos.y - m.radius, `+${Math.round(healed)}`, '#7ce39a', 11); }
  }
  if (m.isBoss) {
    // Bossen slår i en båge och träffar även bakåt-undanhoppare
    game.novas.push({ x: m.pos.x, y: m.pos.y, t: 0, dur: 0.35, r: m.attackRange + 20, color: '#7fd4f0' });
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
