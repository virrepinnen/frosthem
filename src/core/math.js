// @ts-check
/** @typedef {{x:number, y:number}} Vec */

export const TAU = Math.PI * 2;

/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
/** @param {number} a @param {number} b @param {number} t */
export const lerp = (a, b, t) => a + (b - a) * t;

/** @param {number} ax @param {number} ay @param {number} bx @param {number} by */
export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
/** Squared distance — avoids sqrt in hot loops. */
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

/** Normalises an angle to (-PI, PI]. @param {number} a */
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}
/** Smallest difference between two angles. @param {number} a @param {number} b */
export function angleDiff(a, b) { return Math.abs(wrapAngle(a - b)); }

/** Moves `cur` towards `target` by at most `maxStep` per call. @param {number} cur @param {number} target @param {number} maxStep */
export function approach(cur, target, maxStep) {
  const d = target - cur;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

/** Deterministic value noise 0..1 from integer coordinates. @param {number} x @param {number} y @param {number} seed */
export function hashNoise(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothed 2D noise via bilinear interpolation of hashNoise. @param {number} x @param {number} y @param {number} seed */
export function smoothNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const n00 = hashNoise(xi, yi, seed), n10 = hashNoise(xi + 1, yi, seed);
  const n01 = hashNoise(xi, yi + 1, seed), n11 = hashNoise(xi + 1, yi + 1, seed);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}
