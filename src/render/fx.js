// @ts-check
import { rng } from '../core/rng.js';

/**
 * Effektlager: partiklar, flytande siffror och avtryck i snön.
 * Allt här är rent kosmetiskt men bär större delen av "känslan" i striden —
 * feedback på träffar är det som gör att slag känns som slag.
 */

/** @typedef {{x:number,y:number,vx:number,vy:number,life:number,max:number,r:number,color:string,grav:number,fade:number,shape:string}} Particle */
/** @typedef {{x:number,y:number,vy:number,life:number,text:string,color:string,size:number}} FloatText */
/** @typedef {{x:number,y:number,r:number,color:string,life:number,max:number,rot:number}} Decal */

export const fx = {
  /** @type {Particle[]} */ particles: [],
  /** @type {FloatText[]} */ texts: [],
  /** @type {Decal[]} */ decals: [],
  shake: 0,
  flash: 0,
  /** @type {string} */ flashColor: '#ff0000',
};

/**
 * @param {number} x @param {number} y @param {number} n
 * @param {{color?:string, speed?:number, life?:number, size?:number, grav?:number, dir?:number, spread?:number, shape?:string}} [o]
 */
export function burst(x, y, n, o = {}) {
  const color = o.color ?? '#d8e4f2';
  const speed = o.speed ?? 140;
  const life = o.life ?? 0.5;
  const dir = o.dir;
  const spread = o.spread ?? Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = dir === undefined ? rng.range(0, Math.PI * 2) : dir + rng.range(-spread / 2, spread / 2);
    const sp = speed * rng.range(0.35, 1.3);
    fx.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: life * rng.range(0.6, 1.4), max: life, r: (o.size ?? 3) * rng.range(0.6, 1.4),
      color, grav: o.grav ?? 220, fade: 1, shape: o.shape ?? 'dot',
    });
  }
}

/** @param {number} x @param {number} y @param {string} text @param {string} color @param {number} [size] */
export function floatText(x, y, text, color, size = 14) {
  fx.texts.push({ x: x + rng.range(-8, 8), y, vy: -46, life: 0.95, text, color, size });
}

/** @param {number} x @param {number} y @param {number} r @param {string} color */
export function decal(x, y, r, color) {
  fx.decals.push({ x, y, r, color, life: 22, max: 22, rot: rng.range(0, Math.PI * 2) });
  if (fx.decals.length > 220) fx.decals.shift();
}

/** @param {number} amt */
export function shake(amt) { fx.shake = Math.min(22, fx.shake + amt); }
/** @param {number} amt @param {string} [color] */
export function screenFlash(amt, color = '#8e1420') { fx.flash = Math.max(fx.flash, amt); fx.flashColor = color; }

/** @param {number} dt */
export function updateFx(dt) {
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.grav * dt;
    p.vx *= 1 - 2.6 * dt; p.vy *= 1 - 1.1 * dt;
  }
  for (let i = fx.texts.length - 1; i >= 0; i--) {
    const t = fx.texts[i];
    t.life -= dt;
    if (t.life <= 0) { fx.texts.splice(i, 1); continue; }
    t.y += t.vy * dt;
    t.vy += 62 * dt;
  }
  for (let i = fx.decals.length - 1; i >= 0; i--) {
    fx.decals[i].life -= dt;
    if (fx.decals[i].life <= 0) fx.decals.splice(i, 1);
  }
  fx.shake *= Math.pow(0.0016, dt);
  fx.flash *= Math.pow(0.02, dt);
}

export function clearFx() {
  fx.particles.length = 0; fx.texts.length = 0; fx.decals.length = 0;
  fx.shake = 0; fx.flash = 0;
}
