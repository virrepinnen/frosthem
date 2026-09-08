// @ts-check
import { generateZone, ZONE_DEFS, initFog, pushOut, lineBlocked } from './world.js';
import { populateZone } from './spawn.js';
import { rng } from '../core/rng.js';

/** @typedef {import('./world.js').Zone} Zone */

/**
 * The act as one continuous surface.
 *
 * Each map is still generated on its own, in its own local coordinates — that
 * part was never the problem. What changed is that a map is then *placed*: its
 * geometry is translated once into a shared world space, so that the border it
 * shares with its neighbour is literally the same line for both. After that
 * nothing downstream has to know about zones at all. Collision, rendering and
 * the monsters all work in world coordinates, and the seam between two maps is
 * a place you walk across rather than an event that happens to you.
 *
 * Two or three maps are held at a time: the one you are standing in and the
 * ones on either side of it. They are built before you get there and dropped
 * once you are well past them.
 */

/** How far beyond a map you must be before it is dropped. */
const KEEP_DIST = 2200;
/** How thick the wall along an unshared edge is. Only has to be unsteppable. */
const WALL = 500;

/** @returns {{zones: Map<number, Zone>, walls: any[], bounds: {x0:number,y0:number,x1:number,y1:number}}} */
export function createWorld() {
  return { zones: new Map(), walls: [], bounds: { x0: 0, y0: 0, x1: 0, y1: 0 } };
}

/**
 * Moves every coordinate in a freshly generated map by (dx, dy).
 *
 * Done once, here, so that everything after this point can be written as if
 * there were only ever one coordinate system — which is the whole trick.
 * @param {any} z @param {number} dx @param {number} dy
 */
function shiftZone(z, dx, dy) {
  const pt = (/** @type {any} */ o) => { if (o) { o.x += dx; o.y += dy; } };
  z.ox = dx; z.oy = dy;
  pt(z.entry);
  for (const o of z.obstacles) pt(o);
  for (const o of z.decor) pt(o);
  for (const s of z.shrines) pt(s);
  for (const a of z.anchors) pt(a);
  for (const n of z.npcs) pt(n);
  for (const c of z.chests) pt(c);
  pt(z.poi); pt(z.portalPad); pt(z.bossPos);
  for (const road of z.roads) for (const p of road.pts) pt(p);
  for (const e of z.exits) {
    e.x += dx; e.y += dy; e.tx += dx; e.ty += dy;
    e.trigger += (e.edge === 'n' || e.edge === 's') ? dy : dx;
  }
  z._walls = undefined;                 // the line-of-sight cache is stale now
}

/** The world-space rectangle a map occupies. @param {any} z */
export const rectOf = (z) => ({ x0: z.ox, y0: z.oy, x1: z.ox + z.w, y1: z.oy + z.h });

/**
 * Where map `index` has to sit so that its border with `nb` is one line.
 *
 * The two maps leave and enter through opposite edges, so the rule is: put the
 * shared edges on top of each other, and line the two doorways up along it.
 * @param {any} nb The already-placed neighbour @param {any} z The new map, still local
 */
function placementAgainst(nb, z) {
  const out = nb.exits.find((/** @type {any} */ e) => e.to === z.index);
  const back = z.exits.find((/** @type {any} */ e) => e.to === nb.index);
  if (!out || !back) return null;
  switch (out.edge) {
    case 'e': return { dx: nb.ox + nb.w,        dy: out.y - back.y };
    case 'w': return { dx: nb.ox - z.w,         dy: out.y - back.y };
    case 's': return { dx: out.x - back.x,      dy: nb.oy + nb.h };
    default:  return { dx: out.x - back.x,      dy: nb.oy - z.h };
  }
}

/**
 * Makes sure map `index` is built and placed. Returns it, or null if it cannot
 * be placed yet because nothing it borders on is loaded.
 * @param {any} world @param {number} index
 */
export function ensureZone(world, index) {
  if (index < 0 || index >= ZONE_DEFS.length) return null;
  const have = world.zones.get(index);
  if (have) return have;

  const z = generateZone(index, (rng.next() * 0xffffffff) >>> 0);

  if (world.zones.size === 0) {
    shiftZone(z, 0, 0);
  } else {
    const nb = world.zones.get(index - 1) ?? world.zones.get(index + 1);
    if (!nb) return null;
    const at = placementAgainst(nb, z);
    if (!at) return null;
    shiftZone(z, at.dx, at.dy);
  }

  initFog(z);
  world.zones.set(index, z);
  z.monsters = populateZone(z);
  rebuildWalls(world);
  return z;
}

/** Builds the map you are on and the ones either side of it. @param {any} world @param {number} index */
export function ensureAround(world, index) {
  ensureZone(world, index);
  ensureZone(world, index - 1);
  ensureZone(world, index + 1);
}

/** @param {any} world @param {number} x @param {number} y */
export function zoneAt(world, x, y) {
  for (const z of world.zones.values()) {
    if (x >= z.ox && x <= z.ox + z.w && y >= z.oy && y <= z.oy + z.h) return z;
  }
  return null;
}

/**
 * The maps close enough to `(x, y)` to matter for collision.
 * Usually one; two when you are standing on a seam.
 * @param {any} world @param {number} x @param {number} y @param {number} pad
 */
export function zonesNear(world, x, y, pad = 200) {
  /** @type {any[]} */
  const out = [];
  for (const z of world.zones.values()) {
    if (x < z.ox - pad || x > z.ox + z.w + pad) continue;
    if (y < z.oy - pad || y > z.oy + z.h + pad) continue;
    out.push(z);
  }
  return out;
}

/** Every loaded map that shows up inside the given world-space rectangle. */
export function zonesInRect(world, x0, y0, x1, y1) {
  /** @type {any[]} */
  const out = [];
  for (const z of world.zones.values()) {
    if (z.ox > x1 || z.ox + z.w < x0 || z.oy > y1 || z.oy + z.h < y0) continue;
    out.push(z);
  }
  return out;
}

/**
 * Drops maps you have walked well clear of, and their monsters with them.
 * The one you are on and the ones next to it are always kept, so the ground
 * never disappears from under something you can still see.
 * @param {any} world @param {number} current
 */
export function unloadFar(world, current, x, y) {
  let dropped = false;
  for (const [i, z] of [...world.zones]) {
    if (Math.abs(i - current) <= 1) continue;
    const dx = Math.max(z.ox - x, 0, x - (z.ox + z.w));
    const dy = Math.max(z.oy - y, 0, y - (z.oy + z.h));
    if (Math.hypot(dx, dy) < KEEP_DIST) continue;
    world.zones.delete(i);
    dropped = true;
  }
  if (dropped) rebuildWalls(world);
  return dropped;
}

/**
 * The edges of the world you cannot walk off.
 *
 * A map's edge is only a wall where there is no map on the other side. Where
 * two maps meet, the stretch they have in common is simply open ground — which
 * is what makes the seam a place rather than a door. The maps are different
 * sizes and their doorways sit at different heights, so that shared stretch is
 * a piece of the edge rather than all of it, and the rest is wall.
 * @param {any} world
 */
export function rebuildWalls(world) {
  /** @type {{x:number,y:number,w:number,h:number}[]} */
  let strips = [];
  const add = (/** @type {number} */ x, /** @type {number} */ y,
    /** @type {number} */ w, /** @type {number} */ h) => {
    if (w > 1 && h > 1) strips.push({ x, y, w, h });
  };

  for (const z of world.zones.values()) {
    const R = rectOf(z);
    for (const edge of /** @type {const} */ (['n', 's', 'e', 'w'])) {
      if (edge === 'e' || edge === 'w') {
        add(edge === 'e' ? R.x1 : R.x0 - WALL, R.y0 - WALL, WALL, z.h + WALL * 2);
      } else {
        add(R.x0 - WALL, edge === 's' ? R.y1 : R.y0 - WALL, z.w + WALL * 2, WALL);
      }
    }
  }

  // A wall may never sit where there is floor.
  //
  // Each map walls its own four sides and laps a little past the corners so
  // nothing can be squeezed through them. Where two maps meet, that overhang
  // reaches into the neighbour — and the village's east wall, lapping past its
  // own corner, ran straight across the road to the border of the map above it.
  // So every map's rectangle is cut out of every wall afterwards: what is left
  // is exactly the outside of the world, and the stretch two maps share is open
  // ground, which is what makes the seam a place you walk over.
  for (const z of world.zones.values()) strips = strips.flatMap(s => subtract(s, rectOf(z)));

  world.walls = strips.map(s => ({ kind: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, type: 'wall', s: 0 }));

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const z of world.zones.values()) {
    x0 = Math.min(x0, z.ox); y0 = Math.min(y0, z.oy);
    x1 = Math.max(x1, z.ox + z.w); y1 = Math.max(y1, z.oy + z.h);
  }
  world.bounds = world.zones.size ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}

/**
 * `a` minus `b`, as up to four axis-aligned pieces.
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x0:number,y0:number,x1:number,y1:number}} b
 */
function subtract(a, b) {
  const ax1 = a.x + a.w, ay1 = a.y + a.h;
  if (b.x1 <= a.x || b.x0 >= ax1 || b.y1 <= a.y || b.y0 >= ay1) return [a];
  /** @type {{x:number,y:number,w:number,h:number}[]} */
  const out = [];
  const keep = (/** @type {number} */ x, /** @type {number} */ y,
    /** @type {number} */ w, /** @type {number} */ h) => { if (w > 1 && h > 1) out.push({ x, y, w, h }); };
  const cx0 = Math.max(a.x, b.x0), cx1 = Math.min(ax1, b.x1);
  keep(a.x, a.y, cx0 - a.x, a.h);                       // left of the cut
  keep(cx1, a.y, ax1 - cx1, a.h);                       // right of it
  const my0 = Math.max(a.y, b.y0), my1 = Math.min(ay1, b.y1);
  keep(cx0, a.y, cx1 - cx0, my0 - a.y);                 // above, in the middle
  keep(cx0, my1, cx1 - cx0, ay1 - my1);                 // below, in the middle
  return out;
}

/**
 * Keeps a circle out of the scenery and inside the world.
 *
 * Only the maps you are actually near are tested — usually one, two when you
 * are on a seam — so this costs the same as it did when there was only ever one
 * map loaded.
 * @param {any} world @param {{x:number,y:number}} pos @param {number} radius
 */
export function collide(world, pos, radius) {
  for (let iter = 0; iter < 2; iter++) {
    const near = zonesNear(world, pos.x, pos.y, 300);
    for (const z of near) pushOut(z.obstacles, pos, radius);
    pushOut(world.walls, pos, radius);
  }
}

/**
 * Line of sight across the world. A seam blocks nothing: if you can see it, you
 * can shoot at it, even when it is standing in the next map.
 * @param {any} world
 */
export function losBlocked(world, x0, y0, x1, y1) {
  const zs = zonesInRect(world,
    Math.min(x0, x1) - 40, Math.min(y0, y1) - 40,
    Math.max(x0, x1) + 40, Math.max(y0, y1) + 40);
  for (const z of zs) if (lineBlocked(z, x0, y0, x1, y1)) return true;
  return false;
}
