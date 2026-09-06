// @ts-check
/** Seedad slumpgenerator (mulberry32). Deterministisk -> samma seed ger samma zon. */
export class Rng {
  /** @param {number} seed */
  constructor(seed) { this.s = seed >>> 0; }

  /** @returns {number} 0..1 */
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** @param {number} a @param {number} b @returns {number} */
  range(a, b) { return a + this.next() * (b - a); }
  /** Heltal i [a,b] inklusive. @param {number} a @param {number} b */
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  /** @param {number} p @returns {boolean} */
  chance(p) { return this.next() < p; }
  /** @template T @param {T[]} arr @returns {T} */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Viktad dragning. @template T @param {T[]} arr @param {(x:T)=>number} weight @returns {T} */
  weighted(arr, weight) {
    let total = 0;
    for (const x of arr) total += Math.max(0, weight(x));
    let roll = this.next() * total;
    for (const x of arr) { roll -= Math.max(0, weight(x)); if (roll <= 0) return x; }
    return arr[arr.length - 1];
  }
  /** @template T @param {T[]} arr @returns {T[]} ny blandad array */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Global rng för icke-deterministiska effekter (loot-rullningar, partiklar). */
export const rng = new Rng((Math.random() * 0xffffffff) >>> 0);
