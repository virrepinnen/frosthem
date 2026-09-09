// @ts-check
import { camera, PROJ } from './camera.js';

/** World y → screen y inside the camera transform. The ground is squashed. */
const PY = (/** @type {number} */ y) => y * PROJ;
/** Dark silhouette behind figures, so they hold up against the snow. */
const C_SIL = 'rgba(7,11,18,0.95)';
import { fx } from './fx.js';
import { rng } from '../core/rng.js';
import { hashNoise, clamp } from '../core/math.js';
import { RARITY_COLOR } from '../data/items.js';
import { strokeGlyph, KIND_GLYPH } from '../ui/glyphs.js';
import { FOG_CELL } from '../systems/world.js';
import { zonesInRect, DOOR_HALF } from '../systems/worldmap.js';
import { drawHero } from './hero.js';
import { ORB_TIERS } from '../systems/orbs.js';
import { PORTAL_CAST, PORTAL_STEP } from '../entities/player.js';

/**
 * All world rendering. Canvas 2D, top-down, with depth sorting on y so things
 * further down are drawn on top. Placeholder art — but the readability
 * (silhouette, colour contrast against the snow, clear status colours) is
 * designed for real.
 */

const SNOW_TILE = 512;
/** @type {CanvasPattern|null} */
let snowPattern = null;
/** How many world units the minimap window shows across. */
const MINIMAP_SPAN = 3400;
/** The minimap's logical size in CSS pixels. Must match styles.css. */
export const MINIMAP_SIZE = 180;
/** @type {HTMLCanvasElement|null} */
let snowTile = null;
/** @type {{x:number,y:number,z:number,r:number}[]} */
let flakes = [];

/**
 * Periodic noise: the lattice coordinates wrap against `period`, which lets the
 * texture tile without visible seams.
 * @param {number} x @param {number} y @param {number} period @param {number} seed
 */
function periodicNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const wrap = (/** @type {number} */ n) => ((n % period) + period) % period;
  const n00 = hashNoise(wrap(xi), wrap(yi), seed), n10 = hashNoise(wrap(xi + 1), wrap(yi), seed);
  const n01 = hashNoise(wrap(xi), wrap(yi + 1), seed), n11 = hashNoise(wrap(xi + 1), wrap(yi + 1), seed);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

/** Builds a snow texture once and tiles it — far cheaper than per-pixel noise. */
function buildSnowTile() {
  const c = document.createElement('canvas');
  c.width = c.height = SNOW_TILE;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(SNOW_TILE, SNOW_TILE);
  for (let y = 0; y < SNOW_TILE; y++) {
    for (let x = 0; x < SNOW_TILE; x++) {
      // The scales must divide SNOW_TILE evenly for the tiling to line up.
      const n = periodicNoise(x / 64, y / 64, 8, 7) * 0.5
              + periodicNoise(x / 16, y / 16, 32, 13) * 0.32
              + periodicNoise(x / 4, y / 4, 128, 21) * 0.18;
      const val = 168 + (n - 0.5) * 44;
      const i = (y * SNOW_TILE + x) * 4;
      img.data[i] = val * 0.94; img.data[i + 1] = val * 0.98; img.data[i + 2] = val * 1.05; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** @param {number} w @param {number} h */
export function initRenderer(w, h) {
  if (!snowTile) snowTile = buildSnowTile();
  flakes = [];
  for (let i = 0; i < 260; i++) {
    flakes.push({ x: rng.range(0, w), y: rng.range(0, h), z: rng.range(0.3, 1), r: rng.range(0.7, 2.4) });
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} game
 * @param {number} dt
 */
export function render(ctx, game, dt) {
  const W = camera.w, H = camera.h;
  const zone = game.zone;
  // Every map that reaches the screen, not just the one you are standing in.
  // At a seam that is two of them, and the join has to be invisible.
  const pad = 120;
  const vx0 = camera.x - pad, vy0 = camera.y - pad;
  const vx1 = camera.x + W + pad, vy1 = camera.y + H + pad;
  const shown = zonesInRect(game.world, vx0, vy0, vx1, vy1);

  ctx.save();
  const sh = fx.shake;
  const ox = sh ? rng.range(-sh, sh) : 0, oy = sh ? rng.range(-sh, sh) : 0;
  ctx.translate(-Math.round(camera.x) + ox, -Math.round(camera.y * PROJ) + oy);

  // The ground: everything lying *in* the plane is drawn squashed vertically.
  ctx.save();
  ctx.scale(1, PROJ);
  drawGround(ctx, shown);
  for (const z of shown) drawRoads(ctx, z);
  for (const z of shown) drawDecor(ctx, z);
  drawDecals(ctx);
  drawEmbers(ctx, game);
  drawTelegraphs(ctx, game);
  ctx.restore();

  // From here on everything stands up out of the ground, in unsquashed pixels.
  drawShrines(ctx, game);
  drawExits(ctx, game);
  drawPortal(ctx, game);
  drawChests(ctx, game);
  drawGroundItems(ctx, game);
  drawOrbs(ctx, game);
  drawCast(ctx, game);
  ctx.save(); ctx.scale(1, PROJ); drawNovas(ctx, game); ctx.restore();

  // ---- djupsorterad lista -------------------------------------------------
  /** @type {{y:number, f:()=>void}[]} */
  const list = [];

  for (const z of shown) {
    for (const o of z.obstacles) {
      const cx = o.kind === 'circle' ? o.x : o.x + o.w / 2;
      const cy = o.kind === 'circle' ? o.y : o.y + o.h;
      if (cx < vx0 || cy < vy0 || cx > vx1 || cy > vy1) continue;
      list.push({ y: cy, f: () => drawObstacle(ctx, o) });
    }
    for (const n of z.npcs) list.push({ y: n.y, f: () => drawNpc(ctx, n, game) });
  }
  // The ridges that close the map edges. They belong to the world rather than
  // to any one map, because a seam is shared by two.
  for (const o of game.world?.rocks ?? []) {
    if (o.x < vx0 || o.y < vy0 || o.x > vx1 || o.y > vy1) continue;
    list.push({ y: o.y, f: () => drawObstacle(ctx, o) });
  }
  for (const m of game.monsters) {
    if (m.pos.x < vx0 || m.pos.y < vy0 || m.pos.x > vx1 || m.pos.y > vy1) continue;
    list.push({ y: m.pos.y, f: () => drawMonster(ctx, m, game) });
  }
  if (!game.player.dead || game.player.deathT > 0) {
    list.push({ y: game.player.pos.y, f: () => drawPlayer(ctx, game) });
  }
  // The axes go in the same sorted list as everything else, so the ring passes
  // behind you on its way round and in front on the way back. Drawn on top they
  // read as an overlay rather than as something turning about you.
  for (const ax of game.axes ?? []) list.push({ y: ax.y, f: () => drawAxe(ctx, ax) });
  for (const b of game.boulders ?? []) list.push({ y: b.y, f: () => drawBoulder(ctx, b) });
  for (const w of game.gales ?? []) list.push({ y: w.y, f: () => drawGale(ctx, w) });
  for (const f of game.flocks ?? []) list.push({ y: f.y, f: () => drawFlock(ctx, f) });
  list.sort((a, b) => a.y - b.y);
  for (const e of list) e.f();

  drawAimTarget(ctx, game);
  drawBolts(ctx, game);
  drawJavelins(ctx, game);
  drawProjectiles(ctx, game);
  drawInteractPrompt(ctx, game);
  drawParticles(ctx);
  drawFloatTexts(ctx);

  ctx.restore();

  // The screen area in this transform: the height is squashed, unlike camera.h.
  const SH = H * PROJ;
  drawSnowfall(ctx, W, SH, dt);
  drawVignette(ctx, W, SH, zone);

  if (fx.flash > 0.002) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, fx.flash);
    ctx.fillStyle = fx.flashColor;
    ctx.fillRect(0, 0, W, H * PROJ);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */

/**
 * The ground under everything.
 *
 * Painted the other way round from before: the void first, then snow over each
 * map on screen. When there was only ever one map you could paint the dark
 * around its four sides; with two maps meeting at a seam that no longer
 * describes the shape of the world, and the join showed as a black band.
 * @param {CanvasRenderingContext2D} ctx @param {any[]} zones
 */
function drawGround(ctx, zones) {
  ctx.fillStyle = '#0a1018';
  ctx.fillRect(camera.x - 400, camera.y - 400, camera.w + 800, camera.h + 800);
  if (!snowTile) return;
  // Built once. It was being rebuilt every frame, which is a new object and a
  // new upload for a texture that never changes.
  snowPattern ??= ctx.createPattern(snowTile, 'repeat');
  if (!snowPattern) return;
  ctx.fillStyle = snowPattern;
  // Right to the edge. The old inset drew a dark rim around the map, which read
  // as a cliff when a map stood alone — and as a black seam between two of them,
  // which is exactly the join this whole change exists to remove.
  for (const z of zones) ctx.fillRect(z.ox, z.oy, z.w, z.h);
}

/**
 * Paths. Trodden snow: a darker core with lighter edges, plus tracks.
 * The path is the zone's spine — it should be visible from afar without shouting.
 * @param {CanvasRenderingContext2D} ctx @param {any} zone
 */
function drawRoads(ctx, zone) {
  if (!zone.roads) return;
  for (const road of zone.roads) {
    const pts = road.pts;
    if (pts.length < 2) continue;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    };
    /** One stroke of the whole path, shifted towards or away from the light. */
    const layer = (/** @type {number} */ w, /** @type {string} */ c,
      /** @type {number} */ dx = 0, /** @type {number} */ dy = 0) => {
      ctx.save(); ctx.translate(dx, dy);
      ctx.strokeStyle = c; ctx.lineWidth = w; trace(); ctx.restore();
    };

    const W = road.width;
    // A hollow, not a stripe. Everything else in the world is lit from the
    // upper left — a mound would carry its highlight there and its shadow on
    // the far side, so a dip in the ground is that turned around: shade caught
    // along the near rim, snow catching the light along the far one. Without
    // those two the path was just a lighter line laid over the snow.
    layer(W + 22, 'rgba(88,100,120,0.20)', -5, -7);
    layer(W + 16, 'rgba(234,243,253,0.26)', 5, 8);
    // the slope down into it, the trodden floor, and the worn middle
    layer(W + 7, 'rgba(151,163,182,0.30)');
    layer(W, 'rgba(127,139,158,0.55)');
    layer(W * 0.6, 'rgba(112,124,143,0.40)', 1, 1);

    // Snow crowding in from the sides. A path in the world has an edge that
    // wanders; a stroke has one that does not, and that alone reads as paint.
    let carried = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x, ay = pts[i].y;
      const bx = pts[i + 1].x, by = pts[i + 1].y;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let d = carried; d < len; d += 78) {
        const t = d / len;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        const n1 = hashNoise(Math.round(px), Math.round(py), 3);
        const n2 = hashNoise(Math.round(py), Math.round(px), 11);
        const side = n1 < 0.5 ? -1 : 1;
        const off = W * (0.42 + n2 * 0.22) * side;
        ctx.fillStyle = 'rgba(216,228,242,0.42)';
        ctx.beginPath();
        ctx.ellipse(px + nx * off, py + ny * off,
          W * (0.24 + n1 * 0.26), W * (0.18 + n2 * 0.2), Math.atan2(ny, nx), 0, Math.PI * 2);
        ctx.fill();
        carried = d + 78 - len;
      }
    }
    ctx.restore();
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawTelegraphs(ctx, game) {
  for (const m of game.monsters) {
    const t = m.telegraph;
    if (!t || m.dead) continue;
    const k = clamp(t.t, 0, 1);
    ctx.save();
    ctx.translate(t.x, t.y);
    const col = t.color ?? '#8fd8f4';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.55 + k * 0.35;

    if (t.kind === 'circle') {
      ctx.beginPath(); ctx.arc(0, 0, t.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.10 + k * 0.30;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, t.r * k, 0, Math.PI * 2); ctx.fill();
    } else if (t.kind === 'arc') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, t.r, t.dir - t.arc / 2, t.dir + t.arc / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.10 + k * 0.30;
      ctx.fillStyle = col;
      ctx.fill();
    } else if (t.kind === 'line') {
      ctx.rotate(t.dir);
      ctx.strokeRect(0, -t.width / 2, t.r, t.width);
      ctx.globalAlpha = 0.10 + k * 0.30;
      ctx.fillStyle = col;
      ctx.fillRect(0, -t.width / 2, t.r * k, t.width);
    }
    ctx.restore();
  }
}


/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawPortal(ctx, game) {
  const portal = game.portal;
  if (!portal) return;
  const here = game.zone.isTown ? portal.townPos
    : (game.zone.index === portal.zoneIndex ? portal.fromPos : null);
  if (!here) return;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(here.x, PY(here.y));
  const g = ctx.createRadialGradient(0, -34, 4, 0, -34, 90);
  g.addColorStop(0, 'rgba(143,216,244,0.42)');
  g.addColorStop(1, 'rgba(143,216,244,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -34, 90, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.30 + i * 0.14;
    ctx.strokeStyle = '#a8e4f8';
    ctx.lineWidth = 2.5 - i * 0.4;
    const wob = Math.sin(t * 2.2 + i) * 3;
    ctx.beginPath();
    ctx.ellipse(0, -34, 20 - i * 4 + wob, 42 - i * 8 + wob, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  worldLabel(ctx, game.zone.isTown ? portal.zoneName : 'Frosthem', here.x, PY(here.y) - 88, '#c8ecfb', 13);
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawChests(ctx, game) {
  const t = performance.now() / 1000;
  for (const z of game.world.zones.values()) for (const c of z.chests ?? []) {
    ctx.save();
    ctx.translate(c.x, PY(c.y));
    shadow(ctx, 3, 8, 26, 10);
    if (!c.opened) {
      const g = ctx.createRadialGradient(0, -12, 3, 0, -12, 70);
      g.addColorStop(0, `rgba(216,178,106,${0.20 + Math.sin(t * 2) * 0.06})`);
      g.addColorStop(1, 'rgba(216,178,106,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -12, 70, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = c.opened ? '#2e2820' : '#4a3a26';
    ctx.fillRect(-24, -20, 48, 24);
    ctx.fillStyle = c.opened ? '#3a3226' : '#5e4a30';
    if (c.opened) { ctx.save(); ctx.translate(-24, -20); ctx.rotate(-0.9); ctx.fillRect(0, -12, 48, 12); ctx.restore(); }
    else ctx.fillRect(-26, -32, 52, 14);
    ctx.fillStyle = c.opened ? '#5a4a30' : '#d8b26a';
    ctx.fillRect(-4, -26, 8, 14);
    ctx.restore();
    worldLabel(ctx, c.opened ? 'Empty chest' : 'Chest', c.x, PY(c.y) - 44,
      c.opened ? '#8b98ab' : '#f0cf94', 13);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {any} zone */
function drawDecor(ctx, zone) {
  for (const d of zone.decor) {
    if (d.x < camera.x - 240 || d.y < camera.y - 240 || d.x > camera.x + camera.w + 240 || d.y > camera.y + camera.h + 240) continue;
    if (d.type === 'ice') {
      ctx.save();
      ctx.globalAlpha = 0.55;
      const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.1, d.x, d.y, d.r);
      g.addColorStop(0, '#8fb6cf'); g.addColorStop(0.75, '#7ea4c0'); g.addColorStop(1, 'rgba(150,175,196,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.72, d.s * 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.3; ctx.strokeStyle = '#cfe4f2'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(d.x - d.r * 0.6 + i * 12, d.y - d.r * 0.3);
        ctx.lineTo(d.x + d.r * 0.3 + i * 8, d.y + d.r * 0.4);
        ctx.stroke();
      }
      ctx.restore();
    } else if (d.type === 'gravel' || d.type === 'clearing') {
      ctx.save();
      ctx.globalAlpha = d.type === 'gravel' ? 0.5 : 0.28;
      const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.2, d.x, d.y, d.r);
      const c0 = d.type === 'gravel' ? '#6d7484' : '#c8d4e4';
      g.addColorStop(0, c0); g.addColorStop(1, 'rgba(140,155,175,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (d.type === 'mound') {
      ctx.save();
      ctx.globalAlpha = 0.4;
      const g = ctx.createRadialGradient(d.x, d.y - d.r * 0.2, d.r * 0.2, d.x, d.y, d.r);
      g.addColorStop(0, '#c3cedd'); g.addColorStop(1, 'rgba(140,155,175,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.35 + d.s * 0.3;
      ctx.fillStyle = d.s > 0.5 ? '#c9d5e3' : '#93a2b6';
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 1.6, d.r * 0.8, d.s * 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

/** @param {CanvasRenderingContext2D} ctx */
function drawDecals(ctx) {
  for (const d of fx.decals) {
    ctx.save();
    ctx.globalAlpha = clamp(d.life / d.max, 0, 1) * 0.75;
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, d.rot, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawObstacle(ctx, o) {
  if (o.kind === 'rect') { drawBuilding(ctx, o); return; }
  switch (o.type) {
    case 'pine': drawPine(ctx, o); break;
    case 'rock': drawRock(ctx, o); break;
    case 'standingstone': drawStandingStone(ctx, o); break;
    case 'post': drawPost(ctx, o); break;
    case 'hearth': drawHearth(ctx, o); break;
    case 'quarryblock': drawQuarryBlock(ctx, o); break;
    case 'rubble': drawRock(ctx, o); break;
  }
}

/**
 * Text in the world with a dark outline.
 *
 * The size is divided by the camera zoom so text is the same size on screen no
 * matter how close we are — otherwise the signs grow with the zoom and take over.
 * @param {CanvasRenderingContext2D} ctx @param {string} text
 * @param {number} x @param {number} y @param {string} color @param {number} [size] @param {number} [weight]
 */
function worldLabel(ctx, text, x, y, color, size = 12, weight = 600) {
  const px = size / camera.zoom;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `${weight} ${px}px system-ui, sans-serif`;
  ctx.lineWidth = 2.6 / camera.zoom;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(4,7,12,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * The [E] prompt. No box — just the key in gold and a short verb, which
 * bobs slowly so the eye finds it without it shouting.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawInteractPrompt(ctx, game) {
  const it = game.interact;
  if (!it || game.player.dead) return;
  const t = performance.now() / 1000;
  const y = PY(it.y) + Math.sin(t * 1.6) * 3.5;
  const px = 14 / camera.zoom;

  ctx.save();
  ctx.font = `600 ${px}px system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const key = '[E] ';
  const kw = ctx.measureText(key).width;
  const lw = ctx.measureText(it.label).width;
  const x0 = it.x - (kw + lw) / 2;

  ctx.textAlign = 'left';
  ctx.lineWidth = 3 / camera.zoom;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(4,7,12,0.9)';
  ctx.strokeText(key, x0, y);
  ctx.strokeText(it.label, x0 + kw, y);
  ctx.fillStyle = '#e8c072';
  ctx.fillText(key, x0, y);
  ctx.fillStyle = '#f2f6fb';
  ctx.fillText(it.label, x0 + kw, y);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} rx @param {number} ry @param {number} [a] *//** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} rx @param {number} ry @param {number} [a] */
function shadow(ctx, x, y, rx, ry, a = 0.32) {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#1a2434';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawPine(ctx, o) {
  const h = 46 + o.s * 34;
  shadow(ctx, o.x + 7, PY(o.y) + 4, o.r * 1.15, o.r * 0.5);
  ctx.save();
  ctx.translate(o.x, PY(o.y));
  ctx.fillStyle = '#3b2d24';
  ctx.fillRect(-2.5, -8, 5, 10);
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    const w = o.r * (1.25 - t * 0.42);
    const yTop = -h * (0.42 + t * 0.28) - 4;
    const yBot = -h * (t * 0.30) - 2;
    ctx.fillStyle = ['#163026', '#1c3a2d', '#224434'][i];
    ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(-w, yBot); ctx.lineTo(w, yBot); ctx.closePath(); ctx.fill();
    // snow on the branches
    ctx.fillStyle = 'rgba(226,236,246,0.82)';
    ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(-w * 0.62, yBot - (yBot - yTop) * 0.34); ctx.lineTo(w * 0.5, yBot - (yBot - yTop) * 0.42); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawRock(ctx, o) {
  shadow(ctx, o.x + 5, PY(o.y) + 3, o.r * 1.1, o.r * 0.45);
  ctx.save();
  ctx.translate(o.x, PY(o.y));
  ctx.beginPath();
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = o.r * (0.78 + hashNoise(Math.round(o.x), i, Math.round(o.y)) * 0.42);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.72 - o.r * 0.25;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#4d5a6b'; ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#e4ecf5';
  ctx.beginPath(); ctx.ellipse(0, -o.r * 0.7, o.r * 1.1, o.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawStandingStone(ctx, o) {
  const h = o.r * 3.1;
  shadow(ctx, o.x + 8, PY(o.y) + 3, o.r * 1.2, o.r * 0.42);
  ctx.save(); ctx.translate(o.x, PY(o.y));
  const lean = (o.s - 0.5) * 0.3;
  ctx.rotate(lean);
  ctx.fillStyle = '#39445a';
  ctx.beginPath();
  ctx.moveTo(-o.r * 0.62, 0); ctx.lineTo(-o.r * 0.48, -h);
  ctx.lineTo(o.r * 0.46, -h * 0.92); ctx.lineTo(o.r * 0.6, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a5772';
  ctx.beginPath(); ctx.moveTo(-o.r * 0.48, -h); ctx.lineTo(o.r * 0.46, -h * 0.92); ctx.lineTo(o.r * 0.1, -h * 0.86); ctx.lineTo(-o.r * 0.2, -h * 0.94); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(150,210,240,0.32)';
  for (let i = 0; i < 3; i++) ctx.fillRect(-o.r * 0.2, -h * (0.72 - i * 0.2), o.r * 0.4, 2.5);
  ctx.restore();
}

/** A cut stone block — angular and regular, unlike the natural rock. */
/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawQuarryBlock(ctx, o) {
  const h = o.r * 1.5;
  shadow(ctx, o.x + 7, PY(o.y) + 4, o.r * 1.1, o.r * 0.45);
  ctx.save();
  ctx.translate(o.x, PY(o.y));
  ctx.fillStyle = '#59657a';
  ctx.fillRect(-o.r, -h, o.r * 2, h + 4);
  ctx.fillStyle = '#6e7b91';
  ctx.beginPath();
  ctx.moveTo(-o.r, -h); ctx.lineTo(-o.r + 8, -h - 9);
  ctx.lineTo(o.r + 8, -h - 9); ctx.lineTo(o.r, -h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e4ecf5';
  ctx.fillRect(-o.r + 8, -h - 9, o.r * 2, 5);
  ctx.fillStyle = 'rgba(30,40,55,0.35)';
  ctx.fillRect(o.r - 7, -h, 7, h + 4);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawPost(ctx, o) {
  shadow(ctx, o.x + 4, PY(o.y) + 2, o.r * 0.9, o.r * 0.4);
  ctx.save(); ctx.translate(o.x, PY(o.y));
  ctx.fillStyle = '#4a3a2c';
  ctx.beginPath(); ctx.moveTo(-o.r * 0.45, 0); ctx.lineTo(-o.r * 0.3, -34); ctx.lineTo(0, -44); ctx.lineTo(o.r * 0.3, -34); ctx.lineTo(o.r * 0.45, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(226,236,246,0.7)';
  ctx.beginPath(); ctx.moveTo(-o.r * 0.3, -34); ctx.lineTo(0, -44); ctx.lineTo(o.r * 0.3, -34); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawHearth(ctx, o) {
  const t = performance.now() / 1000;
  ctx.save(); ctx.translate(o.x, PY(o.y));
  ctx.fillStyle = '#3a3f4a';
  ctx.beginPath(); ctx.ellipse(0, 0, o.r, o.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const flick = 0.7 + Math.sin(t * 7 + i * 2.1) * 0.3;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = ['#f5c24a', '#f08c3a', '#e05a2a'][i % 3];
    ctx.beginPath();
    ctx.ellipse((i - 2) * 5, -12 - i * 3, 6 * flick, 15 * flick, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(0, -10, 4, 0, -10, 190);
  g.addColorStop(0, 'rgba(255,190,110,0.30)'); g.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, -10, 190, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawBuilding(ctx, o) {
  if (o.type === 'ruin') { drawRuin(ctx, o); return; }
  const roofH = 34;
  // The base sits on the squashed ground; the facade keeps its height in pixels.
  o = { ...o, y: PY(o.y + o.h) - o.h };
  ctx.save();
  ctx.globalAlpha = 0.34; ctx.fillStyle = '#1a2434';
  ctx.fillRect(o.x + 10, o.y + 8, o.w, o.h);
  ctx.globalAlpha = 1;
  // walls
  ctx.fillStyle = '#3c3128';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = '#2e261e';
  for (let y = o.y + 8; y < o.y + o.h; y += 11) ctx.fillRect(o.x, y, o.w, 2);
  // roof (snow-covered)
  ctx.fillStyle = '#e6eef7';
  ctx.beginPath();
  ctx.moveTo(o.x - 10, o.y + 6); ctx.lineTo(o.x + o.w / 2, o.y - roofH);
  ctx.lineTo(o.x + o.w + 10, o.y + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(150,168,190,0.5)';
  ctx.beginPath();
  ctx.moveTo(o.x + o.w / 2, o.y - roofH); ctx.lineTo(o.x + o.w + 10, o.y + 6); ctx.lineTo(o.x + o.w / 2, o.y + 6); ctx.closePath(); ctx.fill();
  // windows with warm light
  const t = performance.now() / 1000;
  const glow = 0.6 + Math.sin(t * 2 + o.s * 9) * 0.12;
  ctx.fillStyle = `rgba(255,190,110,${glow})`;
  ctx.fillRect(o.x + o.w * 0.28, o.y + o.h * 0.42, 15, 13);
  ctx.fillRect(o.x + o.w * 0.62, o.y + o.h * 0.42, 15, 13);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawRuin(ctx, o) {
  o = { ...o, y: PY(o.y + o.h) - o.h };
  ctx.save();
  ctx.globalAlpha = 0.32; ctx.fillStyle = '#1a2434';
  ctx.fillRect(o.x + 8, o.y + 6, o.w, o.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#332b22';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  // broken ridge: only stumps left
  ctx.fillStyle = '#e6eef7';
  ctx.fillRect(o.x - 4, o.y - 5, o.w * 0.35, 9);
  ctx.fillRect(o.x + o.w * 0.62, o.y - 5, o.w * 0.42, 9);
  ctx.fillStyle = '#241d17';
  ctx.fillRect(o.x + o.w * 0.34, o.y + o.h * 0.4, o.w * 0.3, o.h * 0.6);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} n @param {any} game */
function drawNpc(ctx, n, game) {
  const t = performance.now() / 1000;
  shadow(ctx, n.x, PY(n.y) + 2, 13, 6);
  ctx.save(); ctx.translate(n.x, PY(n.y) + Math.sin(t * 1.6 + n.x) * 1.2);
  ctx.fillStyle = '#5b4a3a';
  ctx.beginPath(); ctx.moveTo(-11, 4); ctx.quadraticCurveTo(0, -28, 11, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8c2a0';
  ctx.beginPath(); ctx.arc(0, -26, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d3128';
  ctx.beginPath(); ctx.arc(0, -29, 7, Math.PI, 0); ctx.fill();
  ctx.restore();

  const near = Math.hypot(game.player.pos.x - n.x, game.player.pos.y - n.y) < 115;
  worldLabel(ctx, n.name, n.x, PY(n.y) - 44, near ? '#e8c88a' : '#c2d2e6', 13);
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawShrines(ctx, game) {
  const t = performance.now() / 1000;
  for (const z of game.world.zones.values()) for (const s of z.shrines) {
    ctx.save(); ctx.translate(s.x, PY(s.y));
    const alive = !s.used;
    shadow(ctx, 2, 4, 18, 8);
    ctx.fillStyle = alive ? '#4e5f78' : '#39424f';
    ctx.beginPath(); ctx.moveTo(-13, 4); ctx.lineTo(-9, -34); ctx.lineTo(9, -34); ctx.lineTo(13, 4); ctx.closePath(); ctx.fill();
    if (alive) {
      const pulse = 0.55 + Math.sin(t * 2.4 + s.x) * 0.25;
      const col = { dmg: '#e07a5a', armor: '#9fb6d4', speed: '#8ee0b0', heal: '#e05a72', xp: '#d8b26a' }[s.kind] || '#7fd4f0';
      const g = ctx.createRadialGradient(0, -18, 2, 0, -18, 64);
      g.addColorStop(0, col + 'cc'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = pulse; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -18, 64, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, -22 + Math.sin(t * 2) * 3, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * The zone border. No portal — just the path leaving the picture and vanishing
 * into driving snow, with two standing stones as a gate and the name of what
 * lies beyond.
 *
 * Drawn from the exit's own vectors rather than from x and y, so it looks the
 * same whichever of the four edges the border happens to sit on.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawExits(ctx, game) {
  const t = performance.now() / 1000;
  for (const z of game.world.zones.values()) for (const e of z.exits) {
    // Outward normal and the along-edge direction, both in world space. The
    // projection squashes y, so screen-space positions come from PY().
    const ox = e.dirX, oy = e.dirY;
    const ax = -e.dirY, ay = e.dirX;
    const at = (/** @type {number} */ out, /** @type {number} */ along) => ({
      x: e.tx + ox * out + ax * along,
      y: PY(e.ty + oy * out + ay * along),
    });

    // The white glare that used to fill the last stretch is gone. It was there
    // to say "this is a way out" back when the way out was a teleport, and once
    // the border became a gap in a rock ridge it was a light with no source —
    // the stones and the path say it now.

    // Two standing stones, one at each end of the wall, marking the mouth of
    // the passage. There used to be four: both maps meet at the same border and
    // each drew its own pair, so the gate stood twice, once on either side of a
    // line neither of them owned. The map with the lower number draws it now.
    //
    // They sit on the seam itself, exactly `DOOR_HALF` out from the middle,
    // which is where the boulders stop — so the stones are the ends of the wall
    // rather than an ornament standing near it. No unsquashing of the offset
    // either: the ridge is squashed by the projection like everything else on
    // the ground, and the stones have to line up with it.
    const owns = !game.world.zones.has(e.to) || z.index < e.to;
    // Taken from the map's own edge, not from the exit marker. Out in the wild
    // the two are 26 px apart and either would do, but the village's gate sits
    // back at the palisade — reading the position off it put the stones in the
    // middle of the village and left the actual border bare.
    const gate = {
      x: e.edge === 'w' ? z.ox : e.edge === 'e' ? z.ox + z.w : e.x,
      y: e.edge === 'n' ? z.oy : e.edge === 's' ? z.oy + z.h : e.y,
    };
    for (const side of owns ? [-1, 1] : []) {
      const base = {
        x: gate.x + ax * side * DOOR_HALF,
        y: PY(gate.y + ay * side * DOOR_HALF),
      };
      const h = 88 + side * 6;
      ctx.save(); ctx.translate(base.x, base.y);
      ctx.fillStyle = 'rgba(4,7,12,0.34)';
      ctx.beginPath(); ctx.ellipse(0, 2, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(side * 0.05);
      const gr = ctx.createLinearGradient(-14, -h, 14, 0);
      gr.addColorStop(0, '#3d4b60'); gr.addColorStop(0.55, '#293445'); gr.addColorStop(1, '#161e2b');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(-13, 0); ctx.lineTo(-9.5, -h); ctx.lineTo(8, -h - 7); ctx.lineTo(13, 0);
      ctx.closePath(); ctx.fill();
      // Snow on top and a cool glow facing the opening.
      ctx.fillStyle = 'rgba(226,239,250,0.72)';
      ctx.beginPath(); ctx.moveTo(-9.5, -h); ctx.lineTo(8, -h - 7); ctx.lineTo(8, -h + 1); ctx.lineTo(-9.5, -h + 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(150,214,244,${0.2 + Math.sin(t * 1.5 + side) * 0.07})`;
      ctx.fillRect(-side * 3 - 1.8, -h * 0.74, 3.6, h * 0.52);
      ctx.restore();
    }

    // The name hangs above the gate mouth like a sign, not beside it: placing it
    // along the road put it in the walking lane on an east/west border, right
    // on top of the figure. Above the stones it reads the same on all four
    // edges, and stays on screen where the camera stops at the map edge.
    const lab = at(0, 0);
    worldLabel(ctx, e.label, lab.x, lab.y - 116, '#d6ecfb', 15);
    worldLabel(ctx, e.edge === 'n' ? '▲' : e.edge === 's' ? '▼' : e.edge === 'w' ? '◀' : '▶',
      lab.x, lab.y - 96, 'rgba(190,224,244,0.72)', 11);
  }
}

/**
 * Things lying on the ground.
 *
 * A rare or unique gets a pillar of light standing out of the snow. Drops are
 * rare enough now that one should be visible across the clearing — you should
 * see it before you read its label, and walk towards it on purpose.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawGroundItems(ctx, game) {
  const t = performance.now() / 1000;
  for (const g of game.ground) {
    const bob = Math.sin(t * 3 + g.x) * 2;
    // A relic gets the tallest pillar there is. It is the rarest thing that
    // drops and the only one that changes how the character fights.
    const col = g.kind === 'gold' ? '#d8b26a'
      : g.kind === 'potion' ? '#e05a72'
      : g.kind === 'relic' ? '#cfa6ff'
      : RARITY_COLOR[g.item.rarity];
    const big = g.kind === 'relic'
      || (g.kind === 'item' && (g.item.rarity === 'unique' || g.item.rarity === 'rare'));

    ctx.save(); ctx.translate(g.x, PY(g.y));
    if (big) {
      // The pillar: brightest at the ground, fading out well above head height.
      const pulse = 0.55 + Math.sin(t * 2.2 + g.x) * 0.12;
      const h = g.kind === 'relic' ? 170 : g.item.rarity === 'unique' ? 150 : 108;
      const beam = ctx.createLinearGradient(0, 0, 0, -h);
      beam.addColorStop(0, col + 'aa'); beam.addColorStop(0.35, col + '55');
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = pulse;
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineTo(5, -h); ctx.lineTo(-5, -h);
      ctx.closePath(); ctx.fill();
      // A ring lying in the snow, so the pillar has a foot to stand on.
      ctx.globalAlpha = pulse * 0.8;
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 22 * PROJ, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const rr = big ? 44 : 26;
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, rr);
    grad.addColorStop(0, col + '99'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, bob, rr, 0, Math.PI * 2); ctx.fill();

    ctx.translate(0, bob);
    const name = g.kind === 'gold' ? 'gold'
      : g.kind === 'potion' ? 'potion'
      : g.kind === 'relic' ? 'axe'
      : (KIND_GLYPH[g.item.base.kind] ?? 'ring');
    strokeGlyph(ctx, name, big ? 26 : 21, col, big ? 1.9 : 1.7);
    ctx.restore();
  }
}

/**
 * The town portal's cast: a ring in the ground that closes while you charge, and
 * a gate that opens during the last half second. The ring lies *in* the
 * plane, the gate rises out of it.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawCast(ctx, game) {
  const c = game.player.cast;
  if (!c) return;
  const t = performance.now() / 1000;
  const k = Math.min(1, c.t / PORTAL_CAST);
  const openK = Math.max(0, (c.t - (PORTAL_CAST - PORTAL_STEP)) / PORTAL_STEP);
  const cy = PY(c.y);

  // ringen i marken
  ctx.save();
  ctx.translate(c.x, cy);
  ctx.scale(1, PROJ);
  ctx.strokeStyle = 'rgba(143,216,244,0.28)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#a8e4f8';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
  // the runes inside turn slowly
  ctx.globalAlpha = 0.5 + k * 0.4;
  ctx.strokeStyle = '#cfeeff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = t * 0.7 + i * (Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
    ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38);
    ctx.stroke();
  }
  ctx.restore();

  if (openK <= 0) return;

  // the gate opening: a narrow slit widening into an oval
  ctx.save();
  ctx.translate(c.x, cy);
  const h = 46 * openK, w = 19 * Math.pow(openK, 0.6);
  const g = ctx.createRadialGradient(0, -h * 0.62, 2, 0, -h * 0.62, Math.max(w, h) * 1.6);
  g.addColorStop(0, 'rgba(190,238,255,0.75)');
  g.addColorStop(1, 'rgba(143,216,244,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -h * 0.62, w * 2.4, h * 1.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#dff4ff';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    // The rings shrink inward, but the radius must never go below zero: early in
    // the opening the gate is narrower than the gap between the rings.
    const rx = w - i * 4.5, ry = h * 0.62 - i * 4;
    if (rx <= 0.5 || ry <= 0.5) continue;
    ctx.globalAlpha = 0.35 + i * 0.2;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.62, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Experience orbs. Size and colour carry the denomination, so you can see from
 * the ground what is worth walking back for.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawOrbs(ctx, game) {
  const t = performance.now() / 1000;
  for (const o of game.orbs) {
    const T = ORB_TIERS[o.tier];
    const bob = Math.sin(t * 3.2 + o.seed) * 1.6;
    const y = PY(o.y) - 6 + bob;
    const pulse = 0.75 + Math.sin(t * 4 + o.seed) * 0.25;

    ctx.save();
    // the glow on the ground
    ctx.globalAlpha = 0.4 * pulse;
    const g = ctx.createRadialGradient(o.x, y, 1, o.x, y, T.r * 5);
    g.addColorStop(0, T.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(o.x, y, T.r * 5, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = T.core;
    ctx.beginPath(); ctx.arc(o.x, y, T.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(o.x - T.r * 0.3, y - T.r * 0.35, T.r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawNovas(ctx, game) {
  for (const n of game.novas) {
    const t = n.t / n.dur;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.75;
    ctx.strokeStyle = n.color ?? '#a8e4f8';
    ctx.lineWidth = 4 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (0.15 + t * 0.95), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/**
 * Marker around the enemy auto-aim picked. Without it you cannot tell where the
 * blow will land, and auto-aim becomes guesswork instead of relief.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawAimTarget(ctx, game) {
  const m = game.aimTarget;
  if (!m || m.dead || game.player.dead) return;
  const t = performance.now() / 1000;
  const r = m.radius + 9 + Math.sin(t * 4) * 1.5;
  ctx.save();
  ctx.translate(m.pos.x, PY(m.pos.y));
  ctx.strokeStyle = 'rgba(232,240,250,0.62)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, a - 0.28, a + 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawProjectiles(ctx, game) {
  for (const p of game.projectiles) {
    ctx.save();
    ctx.translate(p.x, PY(p.y));
    ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(-11, -1.5, 22, 3);
    ctx.fillStyle = '#9aa8bd';
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(5, -4); ctx.lineTo(5, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* ---------------- entiteter ---------------- */

/**
 * Monsters are drawn upright out of the squashed ground, just like the hero.
 * The camera angle is locked, so direction changes the *image* — which way the
 * figure turns and whether we see its front or back — not the figure's rotation.
 * Letting them lie flat while the hero stands up read as two different games.
 * @param {CanvasRenderingContext2D} ctx @param {any} m @param {any} game
 */
function drawMonster(ctx, m, game) {
  const t = performance.now() / 1000;
  const gx = m.pos.x, gy = PY(m.pos.y);

  if (m.dead) {
    ctx.save();
    ctx.globalAlpha = clamp(m.corpseT / 14, 0, 1) * 0.5;
    ctx.fillStyle = '#2b1c22';
    ctx.beginPath();
    ctx.ellipse(gx, gy, m.radius * 1.4, m.radius * 0.55, m.facing * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const flash = m.hitFlash > 0;
  const frozen = m.freezeT > 0;
  const body = flash ? '#ffffff' : frozen ? '#a8dcf0' : m.def.color;
  const dark = flash ? '#ffd0d0' : frozen ? '#6ab0cc' : m.def.color2;
  const R = m.radius;
  const fx = Math.cos(m.facing), fy = Math.sin(m.facing);
  const mirror = fx < 0 ? -1 : 1;
  const walk = Math.sin((m.walk ?? 0) * 6);
  const idle = Math.sin(t * 2 + m.id) * 0.8;

  // shadow on the ground (wraiths float and barely cast one)
  if (m.shape !== 'wraith') {
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#16202e';
    ctx.beginPath(); ctx.ellipse(gx, gy, R * 1.15, R * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(gx, gy);

  // What it is, stated on the ground before you are in range to find out.
  // The yellow burns brighter than the blue, and both are drawn under the
  // figure so a whole pack of them reads as one shape from a distance.
  const auraColor = m.elite ? m.elite.color : m.champColor;
  if (auraColor) {
    const reach = m.elite ? 3.2 : 2.2;
    ctx.save();
    ctx.scale(1, PROJ);
    const g = ctx.createRadialGradient(0, 0, R * 0.4, 0, 0, R * reach);
    g.addColorStop(0, auraColor + (m.elite ? '77' : '4d'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * reach, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.scale(mirror, 1);

  if (m.shape === 'wolf') {
    // four-legged, seen from the side: body, alternating legs, snout forward, tail back
    const h = R * 1.5;
    ctx.strokeStyle = dark; ctx.lineWidth = R * 0.28; ctx.lineCap = 'round';
    for (const [lx, ph] of [[-R * 0.55, 0], [-R * 0.3, 1], [R * 0.45, 1], [R * 0.7, 0]]) {
      const sw = walk * R * 0.3 * (ph ? -1 : 1);
      ctx.beginPath(); ctx.moveTo(lx, -h * 0.55); ctx.lineTo(lx + sw, 0); ctx.stroke();
    }
    ctx.fillStyle = C_SIL;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.72, R * 1.35, R * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.72, R * 1.22, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    // svans
    ctx.beginPath();
    ctx.moveTo(-R * 1.1, -h * 0.8);
    ctx.quadraticCurveTo(-R * 2, -h * 1.1 + idle, -R * 1.9, -h * 0.55);
    ctx.quadraticCurveTo(-R * 1.5, -h * 0.75, -R * 1.05, -h * 0.62);
    ctx.closePath(); ctx.fill();
    // head and snout
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(R * 1.15, -h * 0.92, R * 0.55, R * 0.48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(R * 1.6, -h * 0.82, R * 0.32, R * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    // ears
    ctx.beginPath();
    ctx.moveTo(R * 0.95, -h * 1.2); ctx.lineTo(R * 1.15, -h * 1.5); ctx.lineTo(R * 1.3, -h * 1.14);
    ctx.closePath(); ctx.fill();
    if (!flash) {
      ctx.fillStyle = '#ffb03a';
      ctx.beginPath(); ctx.arc(R * 1.35, -h * 0.95, R * 0.13, 0, 6.3); ctx.fill();
    }

  } else if (m.shape === 'wraith') {
    // floats: a thin point downward that fades out, no shadow
    const h = R * 2.4;
    const float = Math.sin(t * 1.6 + m.id) * 2;
    ctx.translate(0, float);
    const g = ctx.createRadialGradient(0, -h * 0.6, 2, 0, -h * 0.6, R * 2);
    g.addColorStop(0, body); g.addColorStop(1, 'rgba(60,130,170,0)');
    ctx.globalAlpha = 0.55; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -h * 0.6, R * 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(-R * 0.9, -h * 0.5, -R * 0.75, -h * 0.85);
    ctx.quadraticCurveTo(0, -h * 1.25, R * 0.75, -h * 0.85);
    ctx.quadraticCurveTo(R * 0.9, -h * 0.5, 0, -2);
    ctx.closePath(); ctx.fill();
    if (!flash) {
      ctx.fillStyle = '#dff4ff';
      ctx.beginPath(); ctx.arc(-R * 0.22, -h * 0.88, R * 0.14, 0, 6.3);
      ctx.arc(R * 0.26, -h * 0.88, R * 0.14, 0, 6.3); ctx.fill();
    }

  } else if (m.shape === 'boss') {
    // broad figure with an ice crown
    const h = R * 2.1;
    ctx.strokeStyle = dark; ctx.lineWidth = R * 0.3;
    ctx.beginPath(); ctx.moveTo(-R * 0.4, -h * 0.42); ctx.lineTo(-R * 0.5 + walk * R * 0.2, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R * 0.4, -h * 0.42); ctx.lineTo(R * 0.5 - walk * R * 0.2, 0); ctx.stroke();
    ctx.fillStyle = C_SIL;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.62, R * 0.95, R * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.62, R * 0.85, R * 0.76, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(R * 0.12, -h * 0.66, R * 0.6, R * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    // huvud
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(R * 0.1, -h * 1.12, R * 0.42, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // iskrona
    ctx.fillStyle = '#dff4ff';
    for (let i = 0; i < 5; i++) {
      const a = -2.5 + i * 0.62;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.4, -h * 1.12 + Math.sin(a) * R * 0.34);
      ctx.lineTo(Math.cos(a) * R * 0.95, -h * 1.12 + Math.sin(a) * R * 0.95 - R * 0.3);
      ctx.lineTo(Math.cos(a + 0.3) * R * 0.42, -h * 1.12 + Math.sin(a + 0.3) * R * 0.36);
      ctx.closePath(); ctx.fill();
    }
    if (!flash) {
      ctx.fillStyle = '#8ce8ff';
      ctx.beginPath(); ctx.arc(R * 0.02, -h * 1.1, R * 0.1, 0, 6.3);
      ctx.arc(R * 0.3, -h * 1.1, R * 0.1, 0, 6.3); ctx.fill();
    }

  } else {
    // upright figure: legs, torso, head — and a bow for the archers
    const h = R * 2.4;
    ctx.strokeStyle = dark; ctx.lineWidth = R * 0.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-R * 0.3, -h * 0.42); ctx.lineTo(-R * 0.35 + walk * R * 0.35, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R * 0.3, -h * 0.42); ctx.lineTo(R * 0.35 - walk * R * 0.35, 0); ctx.stroke();
    ctx.fillStyle = C_SIL;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.6, R * 0.72, R * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.6, R * 0.62, R * 0.54, 0, 0, Math.PI * 2); ctx.fill();
    // arm
    ctx.strokeStyle = dark; ctx.lineWidth = R * 0.24;
    ctx.beginPath();
    ctx.moveTo(R * 0.3, -h * 0.72);
    ctx.lineTo(R * 0.85, -h * (m.ai === 'ranged' ? 0.72 : 0.5) + idle);
    ctx.stroke();
    if (m.ai === 'ranged') {
      ctx.strokeStyle = '#8a7050'; ctx.lineWidth = R * 0.14;
      ctx.beginPath(); ctx.arc(R * 1.0, -h * 0.72, R * 0.5, -1.1, 1.1); ctx.stroke();
    }
    // head, tilted slightly forward
    ctx.fillStyle = C_SIL;
    ctx.beginPath(); ctx.ellipse(R * 0.14, -h * 1.02, R * 0.42, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(R * 0.14, -h * 1.02, R * 0.35, R * 0.33, 0, 0, Math.PI * 2); ctx.fill();
    if (!flash && fy > -0.4) {
      ctx.fillStyle = '#11161f';
      ctx.beginPath(); ctx.ellipse(R * 0.28, -h * 1.0, R * 0.16, R * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();

  // --- health bar and status marks ---------------------------------------
  const topY = gy - m.radius * (m.shape === 'boss' ? 2.6 : m.shape === 'wolf' ? 1.9 : 2.7) - 6;
  const showBar = !m.dormant && (m.elite || m.isChampion || m.isBoss || m.hp < m.maxHp);
  if (showBar) {
    const w = m.isBoss ? 90 : m.radius * 2.6;
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,17,0.8)';
    ctx.fillRect(gx - w / 2 - 1, topY - 1, w + 2, 5);
    ctx.fillStyle = m.isBoss ? '#c8354a' : m.elite ? m.elite.color : m.champColor ?? '#a8202a';
    ctx.fillRect(gx - w / 2, topY, w * clamp(m.hp / m.maxHp, 0, 1), 3);
    ctx.restore();
  }
  if (m.freezeT > 0 || m.stunT > 0) {
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '12px system-ui';
    strokeGlyph(ctx, m.freezeT > 0 ? 'wintergrasp' : 'spark', 13,
      m.freezeT > 0 ? '#a8e4f8' : '#ffd88a', 2);
    ctx.restore();
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawPlayer(ctx, game) {
  const p = game.player;
  const t = performance.now() / 1000;

  if (p.dead) { drawHero(ctx, game); return; }

  // Rimfrostaura under figuren
  if ((p.skills.rimeaura ?? 0) > 0) {
    ctx.save();
    const gy = PY(p.pos.y);
    const g = ctx.createRadialGradient(p.pos.x, gy, 30, p.pos.x, gy, 150);
    g.addColorStop(0, 'rgba(127,212,240,0.10)'); g.addColorStop(1, 'rgba(127,212,240,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.pos.x, gy, 150, 150 * PROJ, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawHero(ctx, game);

  // Whirlwind's rings sit on top of the figure
  if (p.whirl) {
    ctx.save();
    ctx.translate(p.pos.x, PY(p.pos.y));
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#e8f0fa'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 46 + i * 12, t * 22 + i * 2, t * 22 + i * 2 + 2.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // facing marker
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.strokeStyle = '#cfe4f2'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(p.pos.x, PY(p.pos.y), 28, 28 * PROJ, 0, p.facing - 0.22, p.facing + 0.22);
  ctx.stroke();
  ctx.restore();
}

/* ---------------- overlays ---------------- */

/** @param {CanvasRenderingContext2D} ctx */
function drawParticles(ctx) {
  for (const p of fx.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.shape === 'shard') {
      ctx.save(); ctx.translate(p.x, PY(p.y)); ctx.rotate(p.vx * 0.01);
      ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(p.x, PY(p.y), p.r * a, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** @param {CanvasRenderingContext2D} ctx */
function drawFloatTexts(ctx) {
  ctx.save();
  ctx.textAlign = 'center';
  for (const t of fx.texts) {
    ctx.globalAlpha = clamp(t.life / 0.95, 0, 1);
    ctx.font = `700 ${t.size}px system-ui, sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,7,12,0.85)';
    ctx.strokeText(t.text, t.x, PY(t.y));
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, PY(t.y));
  }
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H @param {number} dt */
function drawSnowfall(ctx, W, H, dt) {
  const t = performance.now() / 1000;
  const wind = Math.sin(t * 0.23) * 46 + 30;
  ctx.save();
  ctx.fillStyle = '#e8f2fb';
  for (const f of flakes) {
    f.y += (34 + f.z * 78) * dt;
    f.x += (wind * f.z) * dt + Math.sin(t * 2 + f.y * 0.02) * 8 * dt;
    if (f.y > H + 6) { f.y = -6; f.x = rng.range(-40, W + 40); }
    if (f.x > W + 8) f.x = -8;
    if (f.x < -8) f.x = W + 8;
    ctx.globalAlpha = 0.18 + f.z * 0.45;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * f.z, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H @param {any} zone */
function drawVignette(ctx, W, H, zone) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.78);
  g.addColorStop(0, 'rgba(6,10,18,0)');
  g.addColorStop(1, zone.theme === 'barrow' ? 'rgba(4,8,16,0.82)' : 'rgba(6,10,18,0.66)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // cold colour cast
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = zone.theme === 'barrow' ? 'rgba(150,170,210,1)' : 'rgba(186,200,224,1)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Minimap with fog of war.
 *
 * Drawn at the screen's actual resolution (otherwise it goes blurry on a
 * retina panel) and with three clearly separated tones: explored ground, fog, and
 * outside the zone. Order matters — everything is drawn first, then what you
 * have not visited is painted over. Enemies are drawn *after* the fog but only
 * near you: the map remembers terrain, not where the monsters stand.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
export function renderMinimap(ctx, game) {
  const canvas = ctx.canvas;
  // The logical size is a constant, never something we read out of the element.
  // Reading clientWidth and writing it back into the width attribute is a
  // feedback loop: the attribute is also the layout size unless CSS says
  // otherwise, so the map doubled every frame until it covered the screen.
  const S = MINIMAP_SIZE;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(S * dpr)) {
    canvas.width = canvas.height = Math.round(S * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const px = game.player.pos.x, py = game.player.pos.y;
  const world = game.world;

  // A window onto the world rather than a whole map scaled to fit. It follows
  // you, and stops following when it reaches the edge of what exists — so at
  // the far end of the act you see yourself walking towards the corner instead
  // of the world sliding out from under you. Walk back inward and it picks you
  // up again.
  const sc = S / MINIMAP_SPAN;
  const b = world?.bounds ?? { x0: 0, y0: 0, x1: game.zone.w, y1: game.zone.h };
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const half = MINIMAP_SPAN / 2;
  const cx = bw <= MINIMAP_SPAN ? (b.x0 + b.x1) / 2 : clamp(px, b.x0 + half, b.x1 - half);
  const cy = bh <= MINIMAP_SPAN ? (b.y0 + b.y1) / 2 : clamp(py, b.y0 + half, b.y1 - half);
  const wx = (/** @type {number} */ x) => (x - cx) * sc + S / 2;
  const wy = (/** @type {number} */ y) => (y - cy) * sc + S / 2;

  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#05080e';                       // outside the world
  ctx.fillRect(0, 0, S, S);

  const zones = world ? [...world.zones.values()] : [game.zone];
  ctx.fillStyle = '#243448';
  for (const z of zones) ctx.fillRect(wx(z.ox), wy(z.oy), z.w * sc, z.h * sc);

  ctx.fillStyle = '#3d5271';
  for (const z of zones) for (const o of z.obstacles) {
    if (o.type === 'drift') continue;
    if (o.kind === 'circle') {
      const r = Math.max(0.7, o.r * sc);
      ctx.fillRect(wx(o.x) - r, wy(o.y) - r, r * 2, r * 2);
    } else ctx.fillRect(wx(o.x), wy(o.y), Math.max(1, o.w * sc), Math.max(1, o.h * sc));
  }
  ctx.strokeStyle = 'rgba(186,204,228,0.7)';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const z of zones) for (const road of z.roads ?? []) {
    ctx.lineWidth = road.main ? 2.6 : 1.6;
    ctx.beginPath();
    road.pts.forEach((/** @type {any} */ pt, /** @type {number} */ i) =>
      i ? ctx.lineTo(wx(pt.x), wy(pt.y)) : ctx.moveTo(wx(pt.x), wy(pt.y)));
    ctx.stroke();
  }

  /** @param {number} x @param {number} y @param {string} color @param {number} r */
  const pip = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(wx(x), wy(y), r, 0, 6.3); ctx.fill();
  };
  for (const z of zones) {
    for (const sh of z.shrines) if (!sh.used) pip(sh.x, sh.y, '#e0a86a', 2.5);
    for (const c of z.chests ?? []) if (!c.opened) pip(c.x, c.y, '#d8b26a', 2.8);
  }

  // ---- the fog: paint over what you have not seen -------------------------
  const cw = FOG_CELL * sc;
  ctx.fillStyle = '#0a0f18';
  for (const z of zones) {
    if (!z.fog) continue;
    for (let gy = 0; gy < z.fogH; gy++) {
      let run = -1;
      for (let gx = 0; gx <= z.fogW; gx++) {
        const hidden = gx < z.fogW && z.fog[gy * z.fogW + gx] === 0;
        if (hidden) { if (run < 0) run = gx; }
        else if (run >= 0) {
          // Whole runs at a time instead of cell by cell.
          ctx.fillRect(wx(z.ox + run * FOG_CELL), wy(z.oy + gy * FOG_CELL),
            (gx - run) * cw + 0.6, cw + 0.6);
          run = -1;
        }
      }
    }
  }

  // ---- enemies: only those you could plausibly perceive right now ---------
  for (const m of game.monsters) {
    if (m.dead) continue;
    if (Math.hypot(m.pos.x - px, m.pos.y - py) > 620) continue;
    pip(m.pos.x, m.pos.y,
      m.isBoss ? '#ff4a5a' : m.elite ? m.elite.color : m.champColor ?? '#c04a54',
      m.isBoss ? 4 : m.elite ? 3.4 : m.isChampion ? 2.4 : 1.8);
  }

  // ---- yourself, with facing ---------------------------------------------
  ctx.save();
  ctx.translate(wx(px), wy(py));
  ctx.rotate(game.player.facing);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-3.5, -3.6); ctx.lineTo(-1.5, 0); ctx.lineTo(-3.5, 3.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * One circling axe. The haft turns with the ring so the head always leads.
 * @param {CanvasRenderingContext2D} ctx @param {any} ax
 */
function drawAxe(ctx, ax) {
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(ax.x, PY(ax.y) - 16);
  shadow(ctx, 2, 18, 11, 5);
  ctx.rotate(ax.a + t * 7);
  ctx.strokeStyle = '#6b563c';
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, 0); ctx.stroke();
  ctx.fillStyle = '#c9d6e6';
  ctx.beginPath();
  ctx.moveTo(5, -8); ctx.quadraticCurveTo(15, -4, 15, 0);
  ctx.quadraticCurveTo(15, 4, 5, 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8d9cb0';
  ctx.beginPath(); ctx.ellipse(4, 0, 2.4, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawJavelins(ctx, game) {
  for (const j of game.javelins ?? []) {
    ctx.save();
    ctx.translate(j.x, PY(j.y));
    ctx.rotate(Math.atan2(Math.sin(j.a) * PROJ, Math.cos(j.a)));
    ctx.strokeStyle = '#8a7350'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.fillStyle = '#d8e4f2';
    ctx.beginPath(); ctx.moveTo(9, -3.4); ctx.lineTo(18, 0); ctx.lineTo(9, 3.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/**
 * Lightning coming down. Drawn upright out of the ground plane because it has
 * height; the flash on the snow is a nova and belongs to the ground pass.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawBolts(ctx, game) {
  for (const b of game.bolts ?? []) {
    const fade = 1 - b.t / b.dur;
    ctx.save();
    ctx.translate(b.x, PY(b.y));
    ctx.globalAlpha = Math.min(1, fade * 2.2);
    for (const pass of [{ w: 7, c: 'rgba(215,194,255,0.30)' }, { w: 2.6, c: '#f2ecff' }]) {
      ctx.strokeStyle = pass.c; ctx.lineWidth = pass.w;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const h = 460;
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        const jag = (hashNoise(Math.round(b.x) + i, Math.round(b.y), 5) - 0.5) * 34 * (1 - t * 0.4);
        ctx.lineTo(jag, -h * t);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = fade * 0.85;
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, b.r * 1.1);
    g.addColorStop(0, 'rgba(240,234,255,0.85)');
    g.addColorStop(1, 'rgba(160,120,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, b.r * 1.1, b.r * 1.1 * PROJ, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/**
 * The burning ground behind you. Drawn in the ground pass, squashed with it,
 * because a fire lying on snow is part of the snow.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawEmbers(ctx, game) {
  const now = performance.now() / 1000;
  for (const e of game.embers ?? []) {
    const k = e.t / e.dur;
    const fade = 1 - k * k;
    ctx.save();
    ctx.globalAlpha = fade * 0.75;
    const g = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, e.r);
    g.addColorStop(0, 'rgba(255,196,110,0.85)');
    g.addColorStop(0.5, 'rgba(226,110,50,0.45)');
    g.addColorStop(1, 'rgba(120,40,20,0)');
    ctx.fillStyle = g;
    const pulse = 1 + Math.sin(now * 6 + e.x * 0.05) * 0.06;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** A boulder, turning as it goes. @param {CanvasRenderingContext2D} ctx @param {any} b */
function drawBoulder(ctx, b) {
  ctx.save();
  ctx.translate(b.x, PY(b.y) - b.r * 0.55);
  shadow(ctx, 3, b.r * 0.62, b.r * 1.05, b.r * 0.42);
  ctx.rotate(b.spin);
  ctx.beginPath();
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = b.r * (0.82 + hashNoise(i, Math.round(b.a * 10), 3) * 0.3);
    i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#5c6879'; ctx.fill();
  ctx.strokeStyle = '#3a4454'; ctx.lineWidth = 2; ctx.stroke();
  ctx.clip();
  ctx.fillStyle = '#e4ecf5';
  ctx.beginPath(); ctx.ellipse(-b.r * 0.2, -b.r * 0.55, b.r * 0.9, b.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A wandering wind: arcs turning about an empty middle. */
function drawGale(ctx, w) {
  const fade = Math.min(1, (w.dur - w.t) * 1.6) * Math.min(1, w.t * 3);
  ctx.save();
  ctx.translate(w.x, PY(w.y));
  ctx.globalAlpha = fade * 0.55;
  ctx.scale(1, PROJ);
  for (let i = 0; i < 4; i++) {
    const rr = w.r * (0.32 + i * 0.22);
    ctx.strokeStyle = i % 2 ? 'rgba(214,232,246,0.85)' : 'rgba(160,190,216,0.7)';
    ctx.lineWidth = 3.2 - i * 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, rr, w.spin * (1 + i * 0.35), w.spin * (1 + i * 0.35) + 2.3);
    ctx.stroke();
  }
  ctx.globalAlpha = fade * 0.16;
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, w.r);
  g.addColorStop(0, 'rgba(226,240,252,0.8)');
  g.addColorStop(1, 'rgba(180,206,230,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, w.r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Ravens turning over the spot they have settled on. */
function drawFlock(ctx, f) {
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(f.x, PY(f.y));
  const fade = Math.min(1, (f.dur - f.t) * 2) * Math.min(1, f.t * 4);
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#141a26';
  for (let i = 0; i < 9; i++) {
    const a = t * (1.6 + (i % 3) * 0.4) + (i / 9) * Math.PI * 2;
    const rr = f.r * (0.35 + ((i * 7) % 10) / 14);
    const bx = Math.cos(a) * rr;
    const by = Math.sin(a) * rr * PROJ - 26 - Math.sin(t * 4 + i) * 10;
    const flap = Math.sin(t * 13 + i * 2) * 4;
    ctx.beginPath();
    ctx.moveTo(bx - 7, by + flap);
    ctx.quadraticCurveTo(bx, by - 3, bx + 7, by - flap);
    ctx.quadraticCurveTo(bx, by + 2.5, bx - 7, by + flap);
    ctx.fill();
  }
  ctx.restore();
}

