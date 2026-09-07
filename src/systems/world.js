// @ts-check
import { Rng } from '../core/rng.js';
import { clamp, smoothNoise, wrapAngle } from '../core/math.js';

/**
 * Procedurell zongenerering.
 *
 * Zoner regenereras varje gång du går in i dem — precis som Diablo 2:s
 * vildmarker. Det gör att kartan aldrig blir "löst", men reglerna
 * (täthet, temavariation, var utgångarna sitter) är handdesignade så att
 * resultatet håller sig läsbart.
 */

/** @typedef {{kind:'circle', x:number, y:number, r:number, type:string, s:number}} CircleObstacle */
/** @typedef {{kind:'rect', x:number, y:number, w:number, h:number, type:string, s:number, door?:number}} RectObstacle */
/** @typedef {CircleObstacle|RectObstacle} Obstacle */

/**
 * @typedef {Object} Zone
 * @property {number} index
 * @property {string} name
 * @property {string} theme
 * @property {number} level
 * @property {number} seed
 * @property {number} w
 * @property {number} h
 * @property {boolean} isTown
 * @property {{x:number,y:number}} entry
 * @property {Obstacle[]} obstacles
 * @property {{x:number,y:number,r:number,s:number,type:string}[]} decor
 * @property {{x:number,y:number,r:number,to:number,label:string,dir:string}[]} exits
 * @property {{x:number,y:number,r:number,kind:string,used:boolean}[]} shrines
 * @property {{x:number,y:number,n:number,elite:boolean}[]} anchors
 * @property {{x:number,y:number,r:number,id:string,name:string,line:string}[]} npcs
 * @property {{pts:{x:number,y:number}[], width:number, main:boolean}[]} roads
 * @property {{x:number,y:number,r:number,kind:string,name:string}|null} poi
 * @property {{x:number,y:number,r:number}|null} waypoint
 * @property {{x:number,y:number}} [portalPad] Var stadsportalen dyker upp i byn
 * @property {{x:number,y:number,r:number,opened:boolean,tier:number}[]} chests
 * @property {Obstacle[]} [_walls] Cache: hinder som blockerar sikt
 * @property {Uint8Array} [fog] Utforskningsrutnät (1 = sedd)
 * @property {number} [fogW]
 * @property {number} [fogH]
 * @property {number} [bossAt]
 * @property {{x:number,y:number}} [bossPos]
 */

export const ZONE_DEFS = [
  { name: 'Frosthem',            theme: 'town',   level: 1,  w: 1500, h: 1150 },
  { name: 'Bleka hedarna',       theme: 'moor',   level: 1,  w: 2600, h: 2000 },
  { name: 'Vargpasset',          theme: 'pass',   level: 5,  w: 2800, h: 2200 },
  { name: 'Den frusna graven',   theme: 'barrow', level: 10, w: 2400, h: 2000 },
];

/* ------------------------------------------------------------------ */
/* Stigar                                                              */
/* ------------------------------------------------------------------ */

/**
 * Bygger en stig som en polylinje med några krökar. Stigen är zonens ryggrad:
 * den ger spelaren en riktning att följa utan att kartan behöver vara en korridor.
 * @param {{x:number,y:number}} from @param {{x:number,y:number}} to
 * @param {Rng} r @param {number} bends @param {number} jitter
 */
function makeRoad(from, to, r, bends, jitter) {
  const pts = [{ ...from }];
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // normal, för sidoförskjutning
  for (let i = 1; i <= bends; i++) {
    const t = i / (bends + 1);
    const off = r.range(-jitter, jitter);
    pts.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off });
  }
  pts.push({ ...to });
  return pts;
}

/**
 * Kortaste avståndet från en punkt till en polylinje.
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

/** Punkt längs en polylinje vid parametern t (0..1 av total längd). */
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

/** Rutstorlek för utforskningsrutnätet, i världsenheter. */
export const FOG_CELL = 40;
/** Hur långt omkring sig spelaren avtäcker kartan. */
export const FOG_RADIUS = 430;

/**
 * Byn är känd från början — den är hem. Vildmarken börjar svart och avtäcks
 * medan man går, som D2:s automap.
 * @param {Zone} zone
 */
export function initFog(zone) {
  zone.fogW = Math.ceil(zone.w / FOG_CELL);
  zone.fogH = Math.ceil(zone.h / FOG_CELL);
  zone.fog = new Uint8Array(zone.fogW * zone.fogH);
  if (zone.isTown) zone.fog.fill(1);
}

/**
 * Avtäcker rutorna kring en punkt. Anropas varje bildruta; den kvadrerade
 * jämförelsen håller det billigt nog att inte märkas.
 * @param {Zone} zone @param {number} x @param {number} y @param {number} [radius]
 */
export function revealFog(zone, x, y, radius = FOG_RADIUS) {
  if (!zone.fog) initFog(zone);
  const r2 = radius * radius;
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
  const gx = Math.floor(x / FOG_CELL), gy = Math.floor(y / FOG_CELL);
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

  // Sex stugor i en ring kring härden. Handbyggd regel, slumpad utfyllnad —
  // byn ska kännas som samma plats varje gång du kommer tillbaka.
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
    if (a > 4.4 && a < 5.1) continue; // öppning mot norr/utgången
    obstacles.push({
      kind: 'circle', x: cx + Math.cos(a) * fenceR, y: cy + Math.sin(a) * fenceR,
      r: 13, type: 'post', s: r.next(),
    });
  }
  // Utanför palissaden: gles skog, bara dekor
  for (let i = 0; i < 90; i++) {
    const a = r.range(0, Math.PI * 2), rad = r.range(fenceR + 60, Math.min(d.w, d.h) / 2 + 120);
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (x < 40 || y < 40 || x > d.w - 40 || y > d.h - 40) continue;
    obstacles.push({ kind: 'circle', x, y, r: 15, type: 'pine', s: r.next() });
  }
  for (let i = 0; i < 130; i++) {
    decor.push({ x: r.range(0, d.w), y: r.range(0, d.h), r: r.range(3, 11), s: r.next(), type: 'drift' });
  }
  // Härden i mitten
  obstacles.push({ kind: 'circle', x: cx, y: cy, r: 30, type: 'hearth', s: 0 });

  return {
    index, name: d.name, theme: d.theme, level: d.level, seed, w: d.w, h: d.h, isTown: true,
    entry: { x: cx, y: cy + 110 },
    obstacles, decor,
    exits: [{ x: cx - 20, y: cy - fenceR - 30, r: 52, to: 1, label: 'Bleka hedarna', dir: 'norr' }],
    shrines: [],
    anchors: [],
    roads: [{ pts: [{ x: cx, y: cy + 40 }, { x: cx - 20, y: cy - fenceR - 30 }], width: 54, main: true }],
    poi: null,
    waypoint: { x: cx + 60, y: cy + 120, r: 34 },
    // Portalen får en egen plats på andra sidan härden. Låg den vid vägstenen
    // hamnade de två resesätten ovanpå varandra och [E] blev en gissningslek.
    portalPad: { x: cx - 175, y: cy + 135 },
    chests: [],
    npcs: [
      { x: cx - 130, y: cy + 60, r: 22, id: 'gerd', name: 'Gerd Askhand',
        line: 'Handla, sälj, eller lämna mig i fred. Snön bryr sig inte.' },
      { x: cx + 140, y: cy - 40, r: 22, id: 'olav', name: 'Gamle Olav',
        line: 'Hravn ligger inte still i graven. Någon måste gå dit.' },
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

  const entry = { x: d.w * 0.5, y: d.h - 200 };
  const exitPt = { x: r.range(d.w * 0.28, d.w * 0.72), y: 160 };

  const THEME = {
    moor:   { treeClusters: 16, clusterSize: [3, 9],  rocks: 55, ponds: 5, elites: 2, density: 0.55,
              packs: 9,  pack: [4, 7], poi: { kind: 'quarry', name: 'Stenbrottet' } },
    pass:   { treeClusters: 26, clusterSize: [5, 14], rocks: 70, ponds: 3, elites: 3, density: 0.78,
              packs: 11, pack: [7, 11], poi: { kind: 'camp',   name: 'Det övergivna lägret' } },
    barrow: { treeClusters: 10, clusterSize: [2, 6],  rocks: 90, ponds: 8, elites: 4, density: 0.62,
              packs: 10, pack: [6, 10], poi: { kind: 'offering', name: 'Offerplatsen' } },
  };
  const params = THEME[/** @type {'moor'|'pass'|'barrow'} */ (d.theme)];

  // ---- stigar -------------------------------------------------------------
  // Huvudstigen binder ihop in- och utgången. Sidostigen leder till zonens
  // avstickare — en plats man väljer att gå till, inte snubblar över.
  const main = makeRoad(entry, exitPt, r, 3, Math.min(d.w, d.h) * 0.16);
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
  /** Fritt från stig, avstickare och entré? */
  const free = (/** @type {number} */ x, /** @type {number} */ y) =>
    inBounds(x, y) && !nearRoad(x, y, 26) && !inPoi(x, y, -40);

  // ---- terräng ------------------------------------------------------------
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
  // Porten läggs där sidostigen faktiskt kommer in — inte i riktning mot
  // korsningen. Stigen kröker sig, så de två riktningarna kan skilja rejält,
  // och det var precis så stenbrottets ring hann sluta sig runt kistan.
  const approach = branchRoad[branchRoad.length - 2] ?? { x: junction.x, y: junction.y };
  const gateDir = Math.atan2(approach.y - poiPos.y, approach.x - poiPos.x);
  buildPoi(obstacles, decor, poiPos, params.poi.kind, r, gateDir);
  // Och som skyddsnät: inget hinder får ligga kvar ovanpå sidostigen.
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.kind !== 'circle') continue;
    if (distToRoad(o.x, o.y, branchRoad) < 20 + o.r + 16) obstacles.splice(i, 1);
  }
  chests.push({ x: poiPos.x, y: poiPos.y - 40, r: 26, opened: false, tier: 2 });
  shrines.push({ x: poiPos.x + 90, y: poiPos.y + 60, r: 30, kind: r.pick(['dmg', 'armor', 'speed', 'xp']), used: false });
  anchors.push({ x: poiPos.x, y: poiPos.y + 10, n: params.pack[1] + 2, elite: true });

  // ---- vägsten ------------------------------------------------------------
  const wpAt = pointAlong(main, 0.06);
  const waypoint = { x: wpAt.x + wpAt.nx * 70, y: wpAt.y + wpAt.ny * 70, r: 34 };
  // Håll marken kring vägstenen fri — den måste alltid gå att kliva fram till.
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    const ox = o.kind === 'circle' ? o.x : o.x + o.w / 2;
    const oy = o.kind === 'circle' ? o.y : o.y + o.h / 2;
    if (Math.hypot(ox - waypoint.x, oy - waypoint.y) < 96) obstacles.splice(i, 1);
  }

  // ---- monstergrupper längs stigen ----------------------------------------
  // Grupperna sitter tätt och ligger nära vägen, så man möter dem på färden
  // i stället för att behöva kamma kartan.
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
  // ett par grupper vid avstickarstigen, så omvägen kostar något
  for (let i = 0; i < 2; i++) {
    const at = pointAlong(branchRoad, 0.35 + i * 0.3);
    anchors.push({ x: at.x + at.nx * r.range(-90, 90), y: at.y + at.ny * r.range(-90, 90),
      n: r.int(params.pack[0], params.pack[1]), elite: false });
  }
  for (let i = 1; i <= params.elites && i < anchors.length; i++) {
    anchors[anchors.length - i].elite = true;
  }

  for (let i = 0; i < 2; i++) {
    const at = pointAlong(main, 0.3 + i * 0.4);
    shrines.push({ x: at.x + at.nx * r.range(150, 300) * (i ? 1 : -1), y: at.y + at.ny * r.range(150, 300) * (i ? 1 : -1),
      r: 30, kind: r.pick(['dmg', 'armor', 'speed', 'heal', 'xp']), used: false });
  }

  /** @type {Zone['exits']} */
  const exits = [
    { x: entry.x, y: d.h - 95, r: 55, to: index - 1, label: ZONE_DEFS[index - 1].name, dir: 'söder' },
  ];
  const isLast = index >= ZONE_DEFS.length - 1;
  if (!isLast) {
    exits.push({ x: exitPt.x, y: exitPt.y, r: 55, to: index + 1, label: ZONE_DEFS[index + 1].name, dir: 'norr' });
  }

  /** @type {Zone} */
  const zone = {
    index, name: d.name, theme: d.theme, level: d.level, seed, w: d.w, h: d.h, isTown: false,
    entry, obstacles, decor, exits, shrines, anchors, npcs: [],
    roads, poi: { ...poiPos, r: 210, kind: params.poi.kind, name: params.poi.name },
    waypoint, chests,
  };

  if (isLast) {
    // Bossarenan ligger vid stigens slut och är rensad från hinder.
    const bx = exitPt.x, by = 340;
    zone.bossAt = 1;
    zone.bossPos = { x: bx, y: by };
    main[main.length - 1] = { x: bx, y: by + 240 };
    zone.obstacles = obstacles.filter(o => {
      const ox = o.kind === 'circle' ? o.x : o.x + o.w / 2;
      const oy = o.kind === 'circle' ? o.y : o.y + o.h / 2;
      return Math.hypot(ox - bx, oy - by) > 300;
    });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.75) continue; // bred öppning söderut, dit stigen leder
      zone.obstacles.push({ kind: 'circle', x: bx + Math.cos(a) * 330, y: by + Math.sin(a) * 330, r: 24, type: 'standingstone', s: r.next() });
    }
    zone.anchors = zone.anchors.filter(a => Math.hypot(a.x - bx, a.y - by) > 430);
    zone.exits = zone.exits.filter(e => e.to !== index + 1);
  }
  return zone;
}

/**
 * Avstickarens innehåll. Varje tema har sin egen plats med egen siluett, så
 * att omvägen känns som *en plats* och inte bara som fler monster.
 * @param {Obstacle[]} obstacles @param {Zone['decor']} decor
 * @param {{x:number,y:number}} c @param {string} kind @param {Rng} r
 * @param {number} gateDir Riktning (från mitten) där muren ska ha en öppning
 */
function buildPoi(obstacles, decor, c, kind, r, gateDir) {
  /** Öppning mot infarten plus en nödutgång mitt emot — aldrig en sluten ring. */
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
 * Vilka hinder räknas som *mur*? Bara de stora: block, stenar och byggnader.
 * Träd och stolpar ska inte stoppa vare sig svep eller pilar — det skulle
 * kännas godtyckligt i strid.
 * @param {Obstacle} o
 */
export function isWall(o) {
  return o.kind === 'rect' || (o.type !== 'pine' && o.type !== 'post' && o.type !== 'drift' && o.r >= 22);
}

/** Cachar murarna per zon; listan ändras aldrig efter generering. */
/** @param {Zone} zone */
export function wallsOf(zone) {
  if (!zone._walls) zone._walls = zone.obstacles.filter(isWall);
  return zone._walls;
}

/**
 * Fri siktlinje mellan två punkter? Används för att hindra att man slår
 * (och skjuter) rakt igenom en klippvägg.
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
 * Kollisionslösning: putta en cirkel ut ur alla hinder den överlappar.
 * Enkel men stabil — vi itererar två gånger så hörn inte fastnar.
 * @param {Zone} zone @param {{x:number,y:number}} pos @param {number} radius
 */
export function resolveCollision(zone, pos, radius) {
  for (let iter = 0; iter < 2; iter++) {
    for (const o of zone.obstacles) {
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
            // Mitt inne i rektangeln: skjut ut åt närmaste kant.
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
  pos.x = clamp(pos.x, radius + 30, zone.w - radius - 30);
  pos.y = clamp(pos.y, radius + 30, zone.h - radius - 30);
}

/** Fri sikt-test mot hinder. @param {Zone} zone @param {number} x @param {number} y */
export function blocked(zone, x, y) {
  for (const o of zone.obstacles) {
    if (o.type === 'drift' || o.type === 'post') continue;
    if (o.kind === 'circle') { if (Math.hypot(x - o.x, y - o.y) < o.r) return true; }
    else if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
  }
  return false;
}

