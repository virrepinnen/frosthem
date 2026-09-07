// @ts-check
import { rng } from '../core/rng.js';
import { grantXp } from '../entities/player.js';
import { burst, floatText } from '../render/fx.js';

/**
 * Erfarenhet faller som klot på marken i stället för att bokföras direkt.
 *
 * Poängen är att belöningen får en plats i rummet: slår du på håll eller kitar
 * runt en flock måste du gå tillbaka och sopa upp det du tjänat. Det ger en
 * naturlig paus efter striden och gör räckvidd till en avvägning i stället för
 * en ren fördel.
 *
 * @typedef {{x:number, y:number, vx:number, vy:number, xp:number, tier:number,
 *            age:number, seed:number, pull:boolean}} Orb
 */

/**
 * Valörerna. Varje färg har en liten och en stor variant, så att både
 * mängden och tyngden i ett byte syns på marken.
 */
export const ORB_TIERS = [
  { v: 2,    core: '#f2f6fb', glow: '#ffffff', r: 2.6 },
  { v: 9,    core: '#f2f6fb', glow: '#ffffff', r: 4.0 },
  { v: 30,   core: '#f2d76a', glow: '#ffe9a0', r: 3.0 },
  { v: 85,   core: '#f2d76a', glow: '#ffe9a0', r: 4.7 },
  { v: 220,  core: '#6fa8f5', glow: '#bcd8ff', r: 3.4 },
  { v: 550,  core: '#6fa8f5', glow: '#bcd8ff', r: 5.3 },
  { v: 1400, core: '#b07af0', glow: '#dcc0ff', r: 4.0 },
  { v: 3600, core: '#b07af0', glow: '#dcc0ff', r: 6.2 },
];

/** Så nära drar klotet till sig — och så nära räknas det som upplockat. */
const MAGNET = 105;
const EAT = 15;
/** Tak på antal klot per byte, så en boss inte täcker arenan med vitt grus. */
const MAX_ORBS = 11;
/** Tak på antal klot i världen samtidigt — därutöver slås de ihop. */
const MAX_FIELD = 90;

/** Lägsta valör som rymmer summan. @param {number} xp */
function tierFor(xp) {
  let t = 0;
  for (let i = ORB_TIERS.length - 1; i >= 0; i--) if (xp >= ORB_TIERS[i].v) { t = i; break; }
  return t;
}

/**
 * Delar upp en summa i valörer, störst först. Blir det för många klot slås
 * resten ihop i det sista — hellre ett tungt klot än ett fält av smulor.
 * @param {number} xp
 * @returns {number[]} tier-index
 */
export function splitXp(xp) {
  /** @type {number[]} */
  const out = [];
  let left = Math.max(1, Math.round(xp));
  for (let i = ORB_TIERS.length - 1; i >= 0 && left > 0; i--) {
    const v = ORB_TIERS[i].v;
    while (left >= v && out.length < MAX_ORBS) { out.push(i); left -= v; }
  }
  if (left > 0) {
    if (out.length) out.push(0);
    else out.push(0);
  }
  return out;
}

/**
 * @param {any} game @param {number} x @param {number} y @param {number} xp
 */
export function spawnXpOrbs(game, x, y, xp) {
  // Fältet fullt: lägg bytet i närmaste klot i stället för att strö ut fler.
  // Ingen erfarenhet går förlorad — klotet växer bara i valör.
  if (game.orbs.length >= MAX_FIELD) {
    let near = null, bd = Infinity;
    for (const o of game.orbs) {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd) { bd = d; near = o; }
    }
    if (near) {
      near.xp += Math.round(xp);
      near.tier = tierFor(near.xp);
      return;
    }
  }
  const tiers = splitXp(xp);
  // Resten som inte gick jämnt ut läggs på det första klotet.
  const accounted = tiers.reduce((a, i) => a + ORB_TIERS[i].v, 0);
  const extra = Math.max(0, Math.round(xp) - accounted);
  tiers.forEach((tier, i) => {
    const a = rng.range(0, Math.PI * 2);
    const sp = rng.range(40, 110);
    game.orbs.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      xp: ORB_TIERS[tier].v + (i === 0 ? extra : 0),
      tier, age: 0, seed: rng.range(0, 6.3), pull: false,
    });
  });
}

/**
 * @param {any} game @param {number} dt
 */
export function updateOrbs(game, dt) {
  const p = game.player;
  let gained = 0, levels = 0, best = -1;
  for (let i = game.orbs.length - 1; i >= 0; i--) {
    const o = game.orbs[i];
    o.age += dt;

    // utkastet bromsar in
    o.x += o.vx * dt; o.y += o.vy * dt;
    const drag = Math.pow(0.0009, dt);
    o.vx *= drag; o.vy *= drag;

    if (p.dead) continue;
    const dx = p.pos.x - o.x, dy = p.pos.y - o.y;
    const d = Math.hypot(dx, dy) || 0.001;

    // Klotet fastnar när man kommit nära nog och släpper sedan aldrig taget —
    // annars kunde det halka av vid ett hastigt riktningsbyte.
    if (!o.pull && d < MAGNET && o.age > 0.25) o.pull = true;
    if (o.pull) {
      const speed = 190 + (1 - Math.min(1, d / MAGNET)) * 420;
      o.vx += (dx / d) * speed * dt * 6;
      o.vy += (dy / d) * speed * dt * 6;
      const cap = 620;
      const v = Math.hypot(o.vx, o.vy);
      if (v > cap) { o.vx = o.vx / v * cap; o.vy = o.vy / v * cap; }
    }

    if (d < EAT) {
      gained += o.xp;
      best = Math.max(best, o.tier);
      const T = ORB_TIERS[o.tier];
      burst(o.x, o.y, o.tier >= 4 ? 10 : 4, {
        color: T.glow, speed: 70, life: 0.35, size: 2, grav: -30,
      });
      game.orbs.splice(i, 1);
    }
  }
  if (gained > 0) {
    levels = grantXp(p, gained);
    // En siffra per uppsopning i stället för en per klot — annars blir det
    // ett textregn så fort man går genom en rensad flock.
    if (best >= 2 || gained >= 15) {
      floatText(p.pos.x, p.pos.y - 46, `+${Math.round(gained)} xp`,
        ORB_TIERS[Math.max(0, best)].glow, best >= 4 ? 16 : 13);
    }
    if (levels > 0) game.onLevelUp?.(levels);
  }
}
