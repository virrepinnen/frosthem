// @ts-check
import { Rng } from '../core/rng.js';
import { clamp, smoothNoise, wrapAngle } from '../core/math.js';
import { T } from './tuning.js';

/**
 * Procedural zone generation.
 *
 * Zones are regenerated every time you enter them — exactly like Diablo 2's
 * wildernesses. That means the map is never "solved", but the rules (density,
 * theme variation, where the exits sit) are hand-designed so the result stays
 * readable.
 */

/** @typedef {{kind:'circle', x:number, y:number, r:number, type:string, s:number}} CircleObstacle */
/** @typedef {{kind:'rect', x:number, y:number, w:number, h:number, type:string, s:number, door?:number}} RectObstacle */
/** @typedef {CircleObstacle|RectObstacle} Obstacle */

/**
 * @typedef {Object} Zone
 * @property {number} index
 * @property {string} name
 * @property {string} area   The area this map belongs to; several share one
 * @property {string} theme
 * @property {number} level
 * @property {number} seed
 * @property {number} w
 * @property {number} h
 * @property {number} [ox] Where this map sits in world space
 * @property {number} [oy]
 * @property {any[]} [monsters]
 * @property {boolean} isTown
 * @property {{x:number,y:number}} entry
 * @property {Obstacle[]} obstacles
 * @property {{x:number,y:number,r:number,s:number,type:string}[]} decor
 * @property {{x:number,y:number,tx:number,ty:number,dirX:number,dirY:number,r:number,
 *   to:number,label:string,edge:'n'|'s'|'e'|'w',trigger:number}[]} exits
 * @property {{x:number,y:number,r:number,kind:string,used:boolean}[]} shrines
 * @property {{x:number,y:number,n:number,elite:boolean}[]} anchors
 * @property {{x:number,y:number,r:number,id:string,name:string,line:string}[]} npcs
 * @property {{pts:{x:number,y:number}[], width:number, main:boolean}[]} roads
 * @property {{x:number,y:number,r:number,kind:string,name:string}|null} poi
 * @property {{x:number,y:number}} [portalPad] Var stadsportalen dyker upp i byn
 * @property {{x:number,y:number,r:number,opened:boolean,tier:number}[]} chests
 * @property {Obstacle[]} [_walls] Cache: obstacles that block line of sight
 * @property {Uint8Array} [fog] Exploration grid (1 = seen)
 * @property {number} [fogW]
 * @property {number} [fogH]
 * @property {number} [bossAt]
 * @property {{x:number,y:number}} [bossPos]
 */

/**
 * Act one, as a chain of maps rather than three big rooms.
 *
 * The model is Diablo 2's act 1: Blood Moor → Cold Plains → Stony Field. Each
 * *area* is several maps that share a name, so the road north is long enough to
 * have a shape — somewhere the wolves are wrong, somewhere people camped and
 * stayed, somewhere the ground is full of graves — and every map is a place
 * rather than a stretch.
 */
export const ZONE_DEFS = [
  { name: 'Frosthem', area: 'Frosthem', theme: 'town', level: 1, w: 1500, h: 1500 },

  { name: 'Utmarkerna',      area: 'Bleka hedarna', theme: 'moor', level: 1, w: 2600, h: 2100,
    poi: { kind: 'quarry', name: 'The Deserted Croft' } },
  { name: 'Stenbrottet',     area: 'Bleka hedarna', theme: 'moor', level: 3, w: 2700, h: 2200,
    poi: { kind: 'quarry', name: 'The Quarry' } },

  { name: 'Nedre passet',    area: 'Vargpasset', theme: 'pass', level: 5, w: 2800, h: 2300,
    poi: { kind: 'camp', name: 'The Toll Post' } },
  { name: 'Lägret',          area: 'Vargpasset', theme: 'pass', level: 7, w: 2700, h: 2200,
    poi: { kind: 'camp', name: 'The Abandoned Camp' } },
  { name: 'Vindbrynet',      area: 'Vargpasset', theme: 'pass', level: 9, w: 2900, h: 2200,
    poi: { kind: 'offering', name: 'The Wind Cairn' } },

  { name: 'Gravfältet',      area: 'Den frusna graven', theme: 'barrow', level: 11, w: 2600, h: 2200,
    poi: { kind: 'offering', name: 'The Offering Ground' } },
  { name: 'Nedstigningen',   area: 'Den frusna graven', theme: 'barrow', level: 13, w: 2500, h: 2100,
    poi: { kind: 'offering', name: 'The Sunken Stair' } },
  { name: 'Hravns hall',     area: 'Den frusna graven', theme: 'barrow', level: 15, w: 2400, h: 2000,
    poi: { kind: 'offering', name: 'The Barrow Mouth' } },
];

/** The four map edges, and the one opposite each. */
const OPPOSITE = /** @type {Record<string,'n'|'s'|'e'|'w'>} */ ({ n: 's', s: 'n', e: 'w', w: 'e' });

/** Outward unit vector for an edge, in world coordinates. */
export const EDGE_DIR = /** @type {Record<string,{x:number,y:number}>} */ ({
  n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 }, e: { x: 1, y: 0 },
});

/**
 * A point on `edge`, `inset` pixels in from it, at fraction `t` along the edge.
 * @param {'n'|'s'|'e'|'w'} edge @param {number} w @param {number} h
 * @param {number} t @param {number} inset
 */
function edgePoint(edge, w, h, t, inset) {
  if (edge === 'n') return { x: w * t, y: inset };
  if (edge === 's') return { x: w * t, y: h - inset };
  if (edge === 'w') return { x: inset, y: h * t };
  return { x: w - inset, y: h * t };
}

/**
 * Which edges this map's entrance and exit lie on.
 *
 * Everything used to run south-to-north, which made every map feel like the
 * same corridor. The only rule now is that the two are never the same edge —
 * an entrance and an exit on one side would be a dead end with extra steps.
 * The chain still reads as "onward" because the map name and the border sign
 * say where you are going, not the compass.
 * @param {number} index @param {number} seed
 */
export function zoneEdges(index, seed) {
  if (index <= 0) return { from: /** @type {'n'|'s'|'e'|'w'} */ ('s'), to: /** @type {'n'|'s'|'e'|'w'} */ ('n') };
  // Seeded on the index alone, so the two neighbours of a map always agree
  // about which side the shared border is on.
  const a = new Rng((index * 2654435761) >>> 0);
  const sides = /** @type {('n'|'s'|'e'|'w')[]} */ (['n', 's', 'e', 'w']);
  const from = index === 1 ? 's' : OPPOSITE[zoneEdges(index - 1, seed).to];
  const rest = sides.filter(x => x !== from);
  return { from, to: a.pick(rest) };
}

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

/**
 * Builds a path as a polyline with a few bends. The path is the zone's spine:
 * it gives the player a direction to follow without the map becoming a corridor.
 * @param {{x:number,y:number}} from @param {{x:number,y:number}} to
 * @param {Rng} r @param {number} bends @param {number} jitter
 */
function makeRoad(from, to, r, bends, jitter) {
  const pts = [{ ...from }];
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // normal, for the sideways offset
  for (let i = 1; i <= bends; i++) {
    const t = i / (bends + 1);
    const off = r.range(-jitter, jitter);
    pts.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off });
  }
  pts.push({ ...to });
  return pts;
}

/**
 * Shortest distance from a point to a polyline.
 * @param {number} px @param {number} py @param {{x:number,y:number}[]} pts
 */
export function distToRoad(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = clamp(((px - a.x) * vx + (py - a.y) * vy) / l2, 0, 1);
    const d = Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
    if (d < best) best = d;
  }
  return best;
}

/** Point along a polyline at parameter t (0..1 of the total length). */
function pointAlong(pts, t) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segs.push(d); total += d;
  }
  let want = total * clamp(t, 0, 1);
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i]) {
      const k = segs[i] ? want / segs[i] : 0;
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const l = Math.hypot(vx, vy) || 1;
      return { x: a.x + vx * k, y: a.y + vy * k, nx: -vy / l, ny: vx / l };
    }
    want -= segs[i];
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, nx: 0, ny: -1 };
}

/**
 * @param {number} index @param {number} seed
 * @returns {Zone}
 */
export function generateZone(index, seed) {
  const d = ZONE_DEFS[index];
  const zone = d.theme === 'town' ? village(index, seed, d) : wilderness(index, seed, d);
  initFog(zone);
  return zone;
}

/* ------------------------------------------------------------------ */
/* Fog of war                                                          */
/* ------------------------------------------------------------------ */

/** Cell size of the exploration grid, in world units. */
export const FOG_CELL = 40;
/** How far around themselves the player uncovers the map. */
export const FOG_RADIUS = 430;

/**
 * The village is known from the start — it is home. The wilderness starts black
 * and is uncovered as you walk, like D2's automap.
 * @param {Zone} zone
 */
export function initFog(zone) {
  zone.fogW = Math.ceil(zone.w / FOG_CELL);
  zone.fogH = Math.ceil(zone.h / FOG_CELL);
  zone.fog = new Uint8Array(zone.fogW * zone.fogH);
  if (zone.isTown) zone.fog.fill(1);
}

/**
 * Uncovers the cells around a point. Called every frame; the squared comparison
 * keeps it cheap enough to go unnoticed.
 * @param {Zone} zone @param {number} x @param {number} y @param {number} [radius]
 */
export function revealFog(zone, x, y, radius = FOG_RADIUS) {
  if (!zone.fog) initFog(zone);
  const r2 = radius * radius;
  // The grid belongs to the map; the coordinates come in as world ones.
  x -= zone.ox ?? 0; y -= zone.oy ?? 0;
  const cx = x / FOG_CELL, cy = y / FOG_CELL;
  const span = Math.ceil(radius / FOG_CELL);
  const x0 = Math.max(0, Math.floor(cx - span)), x1 = Math.min(zone.fogW - 1, Math.ceil(cx + span));
  const y0 = Math.max(0, Math.floor(cy - span)), y1 = Math.min(zone.fogH - 1, Math.ceil(cy + span));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const wx = (gx + 0.5) * FOG_CELL - x, wy = (gy + 0.5) * FOG_CELL - y;
      if (wx * wx + wy * wy <= r2) zone.fog[gy * zone.fogW + gx] = 1;
    }
  }
}

/** @param {Zone} zone @param {number} x @param {number} y */
export function isRevealed(zone, x, y) {
  if (!zone.fog) return false;
  const gx = Math.floor((x - (zone.ox ?? 0)) / FOG_CELL), gy = Math.floor((y - (zone.oy ?? 0)) / FOG_CELL);
  if (gx < 0 || gy < 0 || gx >= zone.fogW || gy >= zone.fogH) return false;
  return zone.fog[gy * zone.fogW + gx] === 1;
}

/** @param {number} index @param {number} seed @param {any} d @returns {Zone} */
function village(index, seed, d) {
  const r = new Rng(seed);
  const cx = d.w / 2, cy = d.h / 2;

  /** @type {Obstacle[]} */
  const obstacles = [];
  /** @type {Zone['decor']} */
  const decor = [];

  // Six cottages in a ring around the hearth. Hand-built rule, random filling —
  // the village should feel like the same place every time you come back.
  const houses = 6;
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + 0.35;
    const rad = 300 + r.range(-25, 25);
    const w = r.range(120, 168), h = r.range(96, 130);
    obstacles.push({
      kind: 'rect', x: cx + Math.cos(a) * rad - w / 2, y: cy + Math.sin(a) * rad - h / 2,
      w, h, type: 'building', s: r.next(), door: a,
    });
  }
  // Palissad av stolpar runt byn
  const fenceR = 470;
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    if (a > 4.4 && a < 5.1) continue; // opening to the north, towards the exit
    obstacles.push({
      kind: 'circle', x: cx + Math.cos(a) * fenceR, y: cy + Math.sin(a) * fenceR,
      r: 13, type: 'post', s: r.next(),
    });
  }
  // Outside the palisade: sparse forest, decoration only
  for (let i = 0; i < 90; i++) {
    const a = r.range(0, Math.PI * 2), rad = r.range(fenceR + 60, Math.min(d.w, d.h) / 2 + 120);
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (x < 40 || y < 40 || x > d.w - 40 || y > d.h - 40) continue;
    obstacles.push({ kind: 'circle', x, y, r: 15, type: 'pine', s: r.next() });
  }
  for (let i = 0; i < 130; i++) {
    decor.push({ x: r.range(0, d.w), y: r.range(0, d.h), r: r.range(3, 11), s: r.next(), type: 'drift' });
  }
  // The hearth at the centre
  obstacles.push({ kind: 'circle', x: cx, y: cy, r: 30, type: 'hearth', s: 0 });

  return {
    index, name: d.name, area: d.area, theme: d.theme, level: d.level, seed, w: d.w, h: d.h, isTown: true,
    entry: { x: cx, y: cy + 110 },
    obstacles, decor,
    // The north gate is a threshold: walk out through the palisade and you are in the wild.
    exits: [{
      x: cx - 20, y: cy - fenceR - 34,
      tx: cx - 20, ty: cy - fenceR - 18,
      dirX: 0, dirY: -1,
      r: 340, to: 1, label: ZONE_DEFS[1].name,
      edge: /** @type {'n'} */ ('n'), trigger: cy - fenceR - 18,
    }],
    shrines: [],
    anchors: [],
    // The path curves past the hearth instead of straight through it. It used
    // to run across the fire — which looked wrong, and also put a wall in the
    // middle of the natural way out of the village.
    roads: [{ pts: [{ x: cx + 30, y: cy + 120 }, { x: cx + 92, y: cy + 20 },
      { x: cx + 112, y: cy - 250 }, { x: cx + 70, y: cy - 420 },
      { x: cx - 20, y: cy - fenceR - 30 }], width: 54, main: true }],
    poi: null,
    portalPad: { x: cx - 175, y: cy + 135 },
    chests: [],
    npcs: [
      { x: cx - 130, y: cy + 60, r: 22, id: 'gerd', name: 'Gerd Askhand',
        line: 'Buy, sell, or leave me be. The snow does not care.' },
      { x: cx + 140, y: cy - 40, r: 22, id: 'olav', name: 'Gamle Olav',
        line: 'Hravn does not lie still in his grave. Someone has to go there.' },
    ],
  };
}

/** @param {number} index @param {number} seed @param {any} d @returns {Zone} */
function wilderness(index, seed, d) {
  const r = new Rng(seed);
  /** @type {Obstacle[]} */ const obstacles = [];
  /** @type {Zone['decor']} */ const decor = [];
  /** @type {Zone['anchors']} */ const anchors = [];
  /** @type {Zone['shrines']} */ const shrines = [];
  /** @type {Zone['chests']} */ const chests = [];

  // Which sides the border lies on. Not always south-to-north any more: every
  // map used to be the same corridor with different trees.
  const E = zoneEdges(index, seed);
  const tFrom = r.range(0.3, 0.7), tTo = r.range(0.28, 0.72);
  const entry = edgePoint(E.from, d.w, d.h, tFrom, 392);
  const exitPt = edgePoint(E.to, d.w, d.h, tTo, 300);

  const THEME = {
    // `elites` is how many yellow packs come *on top of* the one at the detour.
    // Two or three of them at once turned into a wall of modifiers you could not
    // read; one at a time, each with its own pack, is a thing you can see coming
    // and decide about. The ordinary packs are more numerous to make up for it.
    moor:   { treeClusters: 16, clusterSize: [3, 9],  rocks: 55, ponds: 5, elites: 0, density: 0.55,
              packs: 12, pack: [5, 8], poi: { kind: 'quarry', name: 'The Quarry' } },
    pass:   { treeClusters: 26, clusterSize: [5, 14], rocks: 70, ponds: 3, elites: 1, density: 0.78,
              packs: 14, pack: [8, 12], poi: { kind: 'camp',   name: 'The Abandoned Camp' } },
    barrow: { treeClusters: 10, clusterSize: [2, 6],  rocks: 90, ponds: 8, elites: 1, density: 0.62,
              packs: 13, pack: [7, 11], poi: { kind: 'offering', name: 'The Offering Ground' } },
  };
  const params = THEME[/** @type {'moor'|'pass'|'barrow'} */ (d.theme)];
  // Each map may name its own detour; the theme's is the fallback.
  const poiDef = d.poi ?? params.poi;

  // ---- stigar -------------------------------------------------------------
  // The main path ties the entrance to the exit. The side path leads to the
  // zone's detour — a place you choose to go to, not one you stumble over.
  const main = makeRoad(entry, exitPt, r, 3, Math.min(d.w, d.h) * 0.16);
  // The path continues out of the map at both ends. That is what tells you
  // where the border runs — you see where you are heading long before you get
  // there.
  main.unshift(edgePoint(E.from, d.w, d.h, tFrom, 26));
  main.push(edgePoint(E.to, d.w, d.h, tTo, 26));
  const junction = pointAlong(main, r.range(0.32, 0.6));
  const side = r.chance(0.5) ? 1 : -1;
  const poiPos = {
    x: clamp(junction.x + junction.nx * side * r.range(520, 760), 260, d.w - 260),
    y: clamp(junction.y + junction.ny * side * r.range(520, 760), 260, d.h - 260),
  };
  const branchRoad = makeRoad({ x: junction.x, y: junction.y }, poiPos, r, 1, 90);
  /** @type {Zone['roads']} */
  const roads = [
    { pts: main, width: 58, main: true },
    { pts: branchRoad, width: 40, main: false },
  ];

  const nearRoad = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ pad = 0) =>
    roads.some(rd => distToRoad(x, y, rd.pts) < rd.width / 2 + pad);
  const inPoi = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ pad = 0) =>
    Math.hypot(x - poiPos.x, y - poiPos.y) < 210 + pad;
  const inBounds = (/** @type {number} */ x, /** @type {number} */ y) =>
    x > 90 && y > 90 && x < d.w - 90 && y < d.h - 90;
  /** Clear of the path, the detour and the entrance? */
  const free = (/** @type {number} */ x, /** @type {number} */ y) =>
    inBounds(x, y) && !nearRoad(x, y, 26) && !inPoi(x, y, -40);

  // ---- terrain ------------------------------------------------------------
  for (let c = 0; c < params.treeClusters; c++) {
    const cx = r.range(120, d.w - 120), cy = r.range(120, d.h - 120);
    if (smoothNoise(cx / 400, cy / 400, seed) < 1 - params.density) continue;
    const n = r.int(params.clusterSize[0], params.clusterSize[1]);
    for (let i = 0; i < n; i++) {
      const x = cx + r.range(-130, 130), y = cy + r.range(-130, 130);
      if (!free(x, y)) continue;
      obstacles.push({ kind: 'circle', x, y, r: r.range(13, 20), type: 'pine', s: r.next() });
    }
  }
  for (let i = 0; i < params.rocks; i++) {
    const x = r.range(110, d.w - 110), y = r.range(110, d.h - 110);
    if (!free(x, y)) continue;
    obstacles.push({
      kind: 'circle', x, y, r: r.range(14, d.theme === 'barrow' ? 46 : 32),
      type: d.theme === 'barrow' && r.chance(0.35) ? 'standingstone' : 'rock', s: r.next(),
    });
  }
  for (let i = 0; i < params.ponds; i++) {
    const x = r.range(200, d.w - 200), y = r.range(200, d.h - 200);
    if (nearRoad(x, y, 120)) continue;
    decor.push({ x, y, r: r.range(70, 190), s: r.next(), type: 'ice' });
  }
  for (let i = 0; i < 260; i++) {
    decor.push({ x: r.range(0, d.w), y: r.range(0, d.h), r: r.range(4, 16), s: r.next(), type: 'drift' });
  }
  if (d.theme === 'barrow') {
    for (let i = 0; i < 9; i++) {
      const x = r.range(250, d.w - 250), y = r.range(250, d.h - 250);
      if (nearRoad(x, y, 90)) continue;
      decor.push({ x, y, r: r.range(90, 170), s: r.next(), type: 'mound' });
    }
  }

  // ---- avstickaren --------------------------------------------------------
  // The gate is placed where the side path actually arrives — not in the
  // direction of the junction. The path bends, so the two directions can differ
  // sharply, and that is exactly how the quarry's ring closed around the chest.
  const approach = branchRoad[branchRoad.length - 2] ?? { x: junction.x, y: junction.y };
  const gateDir = Math.atan2(approach.y - poiPos.y, approach.x - poiPos.x);
  buildPoi(obstacles, decor, poiPos, poiDef.kind, r, gateDir);
  // And as a safety net: nothing may stand in a road.
  //
  // The detour's wall, the barrow's stone ring and the scattered rocks are all
  // placed by rules of their own, and any of them can land on a path that bends
  // past — the more so now that a map's two borders can be on any two edges, so
  // the road takes a different line every time. One sweep at the end is far
  // cheaper than teaching every placement rule about every road.
  clearRoads(obstacles, roads);
  chests.push({ x: poiPos.x, y: poiPos.y - 40, r: 26, opened: false, tier: 2 });
  shrines.push({ x: poiPos.x + 90, y: poiPos.y + 60, r: 30, kind: r.pick(['dmg', 'armor', 'speed', 'xp']), used: false });
  anchors.push({ x: poiPos.x, y: poiPos.y + 10, n: params.pack[1] + 2, elite: true });


  // ---- monster groups along the path --------------------------------------
  // The groups sit tightly and close to the road, so you meet them on the way
  // instead of having to comb the map.
  let placed = 0, guard = 0;
  while (placed < params.packs && guard++ < 900) {
    const t = r.range(0.14, 0.96);
    const at = pointAlong(main, t);
    const lateral = r.range(40, 240) * (r.chance(0.5) ? 1 : -1);
    const x = clamp(at.x + at.nx * lateral, 160, d.w - 160);
    const y = clamp(at.y + at.ny * lateral, 160, d.h - 160);
    if (Math.hypot(x - entry.x, y - entry.y) < 420) continue;
    if (anchors.some(a => Math.hypot(a.x - x, a.y - y) < 260)) continue;
    anchors.push({ x, y, n: r.int(params.pack[0], params.pack[1]), elite: false });
    placed++;
  }
  // a couple of groups along the side path, so the detour costs something
  for (let i = 0; i < 2; i++) {
    const at = pointAlong(branchRoad, 0.35 + i * 0.3);
    anchors.push({ x: at.x + at.nx * r.range(-90, 90), y: at.y + at.ny * r.range(-90, 90),
      n: r.int(params.pack[0], params.pack[1]), elite: false });
  }
  // Spread out, not stacked. They used to be the last few anchors made, which
  // were the two on the side path — so the map's elites stood next to each other
  // and you met all of them in one fight or none of them at all.
  // Ask for more of them and they are allowed to stand closer, or the spacing
  // rule runs out of room and quietly caps the count — a knob that stops doing
  // anything past two is worse than no knob.
  const wanted = Math.round(params.elites * T.eliteRate);
  const apart = 900 / Math.max(1, T.eliteRate);
  for (let i = 0; i < wanted; i++) {
    const far = anchors.filter(a => !a.elite
      && anchors.every(b => !b.elite || Math.hypot(a.x - b.x, a.y - b.y) > apart));
    if (!far.length) break;
    r.pick(far).elite = true;
  }

  for (let i = 0; i < 2; i++) {
    const at = pointAlong(main, 0.3 + i * 0.4);
    shrines.push({ x: at.x + at.nx * r.range(150, 300) * (i ? 1 : -1), y: at.y + at.ny * r.range(150, 300) * (i ? 1 : -1),
      r: 30, kind: r.pick(['dmg', 'armor', 'speed', 'heal', 'xp']), used: false });
  }

  // The exits sit at the map edge and have no button: walk out of the picture
  // where the path ends and you change zone. `trigger` is the line that counts
  // as "outside" on that edge's axis; `x,y` is the point on the rim and `tx,ty`
  // the point on the trigger line, which is what the renderer and the border
  // check work from — that way none of them has to know which edge it is.
  /** @param {'n'|'s'|'e'|'w'} edge @param {number} t @param {number} to @param {string} label */
  const makeExit = (edge, t, to, label) => {
    const rim = edgePoint(edge, d.w, d.h, t, 26);
    const line = edgePoint(edge, d.w, d.h, t, 260);
    const dir = EDGE_DIR[edge];
    return {
      x: rim.x, y: rim.y, tx: line.x, ty: line.y, dirX: dir.x, dirY: dir.y,
      r: 190, to, label, edge,
      trigger: (edge === 'n' || edge === 's') ? line.y : line.x,
    };
  };
  /** @type {Zone['exits']} */
  const exits = [makeExit(E.from, tFrom, index - 1, ZONE_DEFS[index - 1].name)];
  const isLast = index >= ZONE_DEFS.length - 1;
  if (!isLast) exits.push(makeExit(E.to, tTo, index + 1, ZONE_DEFS[index + 1].name));

  // The border must be visible: a gap in the treeline where the path leaves the
  // map. Without this clearing the pines grow over the gate and you never see it.
  // Measured along and across the border rather than in x and y, so it works
  // the same whichever edge the exit sits on.
  const gateClear = (/** @type {number} */ x, /** @type {number} */ y) =>
    exits.some(e => {
      const dx = x - e.tx, dy = y - e.ty;
      const out = dx * e.dirX + dy * e.dirY;
      const along = Math.abs(dx * -e.dirY + dy * e.dirX);
      return along < 170 && out > -90;
    });
  const clean = obstacles.filter(o => {
    const ox = o.kind === 'circle' ? o.x : o.x + o.w / 2;
    const oy = o.kind === 'circle' ? o.y : o.y + o.h / 2;
    return !gateClear(ox, oy);
  });
  obstacles.length = 0; obstacles.push(...clean);

  /** @type {Zone} */
  const zone = {
    index, name: d.name, area: d.area, theme: d.theme, level: d.level, seed, w: d.w, h: d.h, isTown: false,
    entry, obstacles, decor, exits, shrines, anchors, npcs: [],
    roads, poi: { ...poiPos, r: 210, kind: poiDef.kind, name: poiDef.name },
    chests,
  };

  if (isLast) {
    // The boss arena sits at the end of the path and is cleared of obstacles.
    // The arena sits where the path was heading, pulled far enough in from the
    // edge that its stone ring fits. It used to be hard-coded to the top of the
    // map, which was only ever right while every map ran south to north.
    main.length -= 1;                       // no way onward from the last map
    const dir = EDGE_DIR[E.to];
    const bx = clamp(exitPt.x - dir.x * 200, 430, d.w - 430);
    const by = clamp(exitPt.y - dir.y * 200, 430, d.h - 430);
    zone.bossAt = 1;
    zone.bossPos = { x: bx, y: by };

    // The path stops short of the ring, on the side you approach from.
    const prev = main[main.length - 2] ?? entry;
    const ax = bx - prev.x, ay = by - prev.y;
    const al = Math.hypot(ax, ay) || 1;
    main[main.length - 1] = { x: bx - (ax / al) * 240, y: by - (ay / al) * 240 };

    zone.obstacles = obstacles.filter(o => {
      const ox = o.kind === 'circle' ? o.x : o.x + o.w / 2;
      const oy = o.kind === 'circle' ? o.y : o.y + o.h / 2;
      return Math.hypot(ox - bx, oy - by) > 300;
    });
    // A wide opening facing the way you came in, so the ring reads as a mouth
    // rather than a wall you have to find your way around.
    const open = Math.atan2(-ay, -ax);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      if (Math.abs(wrapAngle(a - open)) < 1.05) continue;
      zone.obstacles.push({ kind: 'circle', x: bx + Math.cos(a) * 330, y: by + Math.sin(a) * 330, r: 24, type: 'standingstone', s: r.next() });
    }
    // The arena's ring is built after the general sweep, so it gets its own.
    clearRoads(zone.obstacles, zone.roads);
    zone.anchors = zone.anchors.filter(a => Math.hypot(a.x - bx, a.y - by) > 430);
    zone.exits = zone.exits.filter(e => e.to !== index + 1);
  }
  return zone;
}

/**
 * Removes every obstacle that stands in a road corridor.
 *
 * The margin is the road's own half-width plus the obstacle's radius plus room
 * for the player — so what is left is a lane you can always walk down, not one
 * you can theoretically squeeze through.
 * @param {Obstacle[]} obstacles @param {Zone['roads']} roads
 */
function clearRoads(obstacles, roads) {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    const ox = o.kind === 'circle' ? o.x : o.x + o.w / 2;
    const oy = o.kind === 'circle' ? o.y : o.y + o.h / 2;
    const rad = o.kind === 'circle' ? o.r : Math.max(o.w, o.h) / 2;
    for (const rd of roads) {
      if (distToRoad(ox, oy, rd.pts) < rd.width / 2 + rad + 18) { obstacles.splice(i, 1); break; }
    }
  }
}

/**
 * The detour's contents. Every theme has its own place with its own silhouette,
 * so the detour feels like *a place* and not just more monsters.
 * @param {Obstacle[]} obstacles @param {Zone['decor']} decor
 * @param {{x:number,y:number}} c @param {string} kind @param {Rng} r
 * @param {number} gateDir Direction (from the centre) where the wall has a gap
 */
function buildPoi(obstacles, decor, c, kind, r, gateDir) {
  /** A gap towards the entrance plus an escape opposite — never a closed ring. */
  const isGate = (/** @type {number} */ a) =>
    Math.abs(wrapAngle(a - gateDir)) < 0.55 || Math.abs(wrapAngle(a - gateDir - Math.PI)) < 0.42;
  // rensa marken i mitten
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    const ox = o.kind === 'circle' ? o.x : o.x + o.w / 2;
    const oy = o.kind === 'circle' ? o.y : o.y + o.h / 2;
    if (Math.hypot(ox - c.x, oy - c.y) < 200) obstacles.splice(i, 1);
  }
  decor.push({ x: c.x, y: c.y, r: 205, s: r.next(), type: kind === 'quarry' ? 'gravel' : 'clearing' });

  if (kind === 'quarry') {
    // brytkant av kubiska block plus utspridd sten
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (isGate(a)) continue;
      const rad = 195 + r.range(-14, 14);
      obstacles.push({ kind: 'circle', x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad,
        r: r.range(24, 36), type: 'quarryblock', s: r.next() });
    }
    for (let i = 0; i < 10; i++) {
      obstacles.push({ kind: 'circle', x: c.x + r.range(-150, 150), y: c.y + r.range(-150, 150),
        r: r.range(12, 22), type: 'rubble', s: r.next() });
    }
  } else if (kind === 'camp') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const w = r.range(70, 96), h = r.range(58, 76);
      obstacles.push({ kind: 'rect', x: c.x + Math.cos(a) * 140 - w / 2, y: c.y + Math.sin(a) * 140 - h / 2,
        w, h, type: 'ruin', s: r.next() });
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (isGate(a)) continue;
      obstacles.push({ kind: 'circle', x: c.x + Math.cos(a) * 200, y: c.y + Math.sin(a) * 200,
        r: 13, type: 'post', s: r.next() });
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      if (isGate(a)) continue;
      obstacles.push({ kind: 'circle', x: c.x + Math.cos(a) * 150, y: c.y + Math.sin(a) * 150,
        r: r.range(20, 30), type: 'standingstone', s: r.next() });
    }
    decor.push({ x: c.x, y: c.y, r: 120, s: r.next(), type: 'mound' });
  }
}

/**
 * Which obstacles count as *wall*? Only the big ones: blocks, rocks and
 * buildings. Trees and posts should stop neither swings nor arrows — that would
 * feel arbitrary in a fight.
 * @param {Obstacle} o
 */
export function isWall(o) {
  return o.kind === 'rect' || (o.type !== 'pine' && o.type !== 'post' && o.type !== 'drift' && o.r >= 22);
}

/** Caches the walls per zone; the list never changes after generation. */
/** @param {Zone} zone */
export function wallsOf(zone) {
  if (!zone._walls) zone._walls = zone.obstacles.filter(isWall);
  return zone._walls;
}

/**
 * Clear line of sight between two points? Used to stop you striking (and
 * shooting) straight through a rock face.
 * @param {Zone} zone @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 */
export function lineBlocked(zone, x0, y0, x1, y1) {
  const walls = wallsOf(zone);
  if (!walls.length) return false;
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.ceil(d / 13));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    for (const o of walls) {
      if (o.kind === 'circle') {
        if ((x - o.x) ** 2 + (y - o.y) ** 2 < o.r * o.r) return true;
      } else if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
    }
  }
  return false;
}

/**
 * Push a circle out of every obstacle in one list. One pass.
 *
 * Split out from the old per-zone version because a position is no longer the
 * business of a single map: standing on a seam, you are inside two of them, and
 * the walls that keep you in the world belong to the world rather than to any
 * one map.
 * @param {any[]} obstacles @param {{x:number,y:number}} pos @param {number} radius
 */
export function pushOut(obstacles, pos, radius) {
  for (const o of obstacles) {
    if (o.type === 'drift') continue;
    if (o.kind === 'circle') {
      const dx = pos.x - o.x, dy = pos.y - o.y;
      const d = Math.hypot(dx, dy), min = o.r + radius;
      if (d < min && d > 0.0001) {
        pos.x = o.x + (dx / d) * min;
        pos.y = o.y + (dy / d) * min;
      } else if (d <= 0.0001) {
        pos.x = o.x + min;
      }
    } else {
      const nx = clamp(pos.x, o.x, o.x + o.w);
      const ny = clamp(pos.y, o.y, o.y + o.h);
      const dx = pos.x - nx, dy = pos.y - ny;
      const d = Math.hypot(dx, dy);
      if (d < radius) {
        if (d > 0.0001) { pos.x = nx + (dx / d) * radius; pos.y = ny + (dy / d) * radius; }
        else {
          // Dead inside the rectangle: push out to the nearest edge.
          const left = pos.x - o.x, right = o.x + o.w - pos.x;
          const top = pos.y - o.y, bottom = o.y + o.h - pos.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) pos.x = o.x - radius;
          else if (m === right) pos.x = o.x + o.w + radius;
          else if (m === top) pos.y = o.y - radius;
          else pos.y = o.y + o.h + radius;
        }
      }
    }
  }
}

/** Line-of-sight test against obstacles. @param {Zone} zone @param {number} x @param {number} y */
export function blocked(zone, x, y) {
  for (const o of zone.obstacles) {
    if (o.type === 'drift' || o.type === 'post') continue;
    if (o.kind === 'circle') { if (Math.hypot(x - o.x, y - o.y) < o.r) return true; }
    else if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
  }
  return false;
}

