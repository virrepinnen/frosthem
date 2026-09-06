// @ts-check
import { camera } from './camera.js';
import { fx } from './fx.js';
import { rng } from '../core/rng.js';
import { hashNoise, clamp } from '../core/math.js';
import { RARITY_COLOR } from '../data/items.js';
import { FOG_CELL } from '../systems/world.js';

/**
 * All världsrendering. Canvas 2D, top-down, med djupsortering på y så att
 * saker längre ner ritas ovanpå. Placeholdergrafik — men läsbarheten
 * (silhuett, färgkontrast mot snön, tydliga statusfärger) är designad på riktigt.
 */

const SNOW_TILE = 512;
/** @type {HTMLCanvasElement|null} */
let snowTile = null;
/** @type {{x:number,y:number,z:number,r:number}[]} */
let flakes = [];

/**
 * Periodiskt brus: gitterkoordinaterna wrappas mot `period`, vilket gör att
 * texturen kan kaklas utan synliga sömmar.
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

/** Bygger en snötextur en gång och kaklar den — mycket billigare än brus per pixel. */
function buildSnowTile() {
  const c = document.createElement('canvas');
  c.width = c.height = SNOW_TILE;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(SNOW_TILE, SNOW_TILE);
  for (let y = 0; y < SNOW_TILE; y++) {
    for (let x = 0; x < SNOW_TILE; x++) {
      // Skalorna måste dela SNOW_TILE jämnt för att kaklingen ska gå ihop.
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

  ctx.save();
  const sh = fx.shake;
  const ox = sh ? rng.range(-sh, sh) : 0, oy = sh ? rng.range(-sh, sh) : 0;
  ctx.translate(-Math.round(camera.x) + ox, -Math.round(camera.y) + oy);

  drawGround(ctx, zone);
  drawRoads(ctx, zone);
  drawDecor(ctx, zone);
  drawDecals(ctx);
  drawTelegraphs(ctx, game);
  drawShrines(ctx, game);
  drawExits(ctx, game);
  drawWaypoint(ctx, game);
  drawPortal(ctx, game);
  drawChests(ctx, game);
  drawGroundItems(ctx, game);
  drawNovas(ctx, game);

  // ---- djupsorterad lista -------------------------------------------------
  /** @type {{y:number, f:()=>void}[]} */
  const list = [];
  const pad = 120;
  const vx0 = camera.x - pad, vy0 = camera.y - pad, vx1 = camera.x + W + pad, vy1 = camera.y + H + pad;

  for (const o of zone.obstacles) {
    const cx = o.kind === 'circle' ? o.x : o.x + o.w / 2;
    const cy = o.kind === 'circle' ? o.y : o.y + o.h;
    if (cx < vx0 || cy < vy0 || cx > vx1 || cy > vy1) continue;
    list.push({ y: cy, f: () => drawObstacle(ctx, o) });
  }
  for (const n of zone.npcs) list.push({ y: n.y, f: () => drawNpc(ctx, n, game) });
  for (const m of game.monsters) {
    if (m.pos.x < vx0 || m.pos.y < vy0 || m.pos.x > vx1 || m.pos.y > vy1) continue;
    list.push({ y: m.pos.y, f: () => drawMonster(ctx, m, game) });
  }
  if (!game.player.dead || game.player.deathT > 0) {
    list.push({ y: game.player.pos.y, f: () => drawPlayer(ctx, game) });
  }
  list.sort((a, b) => a.y - b.y);
  for (const e of list) e.f();

  drawAimTarget(ctx, game);
  drawProjectiles(ctx, game);
  drawInteractPrompt(ctx, game);
  drawParticles(ctx);
  drawFloatTexts(ctx);

  ctx.restore();

  drawSnowfall(ctx, W, H, dt);
  drawVignette(ctx, W, H, zone);

  if (fx.flash > 0.002) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, fx.flash);
    ctx.fillStyle = fx.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */

/** @param {CanvasRenderingContext2D} ctx @param {any} zone */
function drawGround(ctx, zone) {
  const x0 = Math.floor(camera.x / SNOW_TILE) * SNOW_TILE;
  const y0 = Math.floor(camera.y / SNOW_TILE) * SNOW_TILE;
  if (!snowTile) return;
  const pat = ctx.createPattern(snowTile, 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(x0 - SNOW_TILE, y0 - SNOW_TILE, camera.w + SNOW_TILE * 3, camera.h + SNOW_TILE * 3);
  }
  // Utanför zonen: mörk avgrund/klippa
  ctx.fillStyle = '#0a1018';
  const m = 30;
  ctx.fillRect(camera.x - 400, camera.y - 400, camera.w + 800, Math.max(0, m - camera.y + 400) - 400 + 400);
  if (camera.x < m) ctx.fillRect(camera.x - 400, camera.y - 400, m - camera.x + 400, camera.h + 800);
  if (camera.y < m) ctx.fillRect(camera.x - 400, camera.y - 400, camera.w + 800, m - camera.y + 400);
  if (camera.x + camera.w > zone.w - m) ctx.fillRect(zone.w - m, camera.y - 400, camera.x + camera.w - zone.w + m + 400, camera.h + 800);
  if (camera.y + camera.h > zone.h - m) ctx.fillRect(camera.x - 400, zone.h - m, camera.w + 800, camera.y + camera.h - zone.h + m + 400);
}

/**
 * Stigar. Upptrampad snö: mörkare kärna med ljusare kanter, plus spår.
 * Stigen är zonens ryggrad — den ska synas på håll utan att skrika.
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
    for (const pass of [
      { w: road.width + 10, c: 'rgba(198,210,226,0.30)' },
      { w: road.width,      c: 'rgba(139,152,171,0.55)' },
      { w: road.width * 0.5, c: 'rgba(122,134,152,0.42)' },
    ]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
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
function drawWaypoint(ctx, game) {
  const w = game.zone.waypoint;
  if (!w) return;
  const known = game.waypoints.has(game.zone.index);
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(w.x, w.y);
  // ring i marken
  ctx.strokeStyle = known ? 'rgba(143,216,244,0.55)' : 'rgba(150,165,185,0.30)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 6, w.r, w.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  if (known) {
    const g = ctx.createRadialGradient(0, -20, 3, 0, -20, 110);
    g.addColorStop(0, `rgba(143,216,244,${0.22 + Math.sin(t * 1.7) * 0.07})`);
    g.addColorStop(1, 'rgba(143,216,244,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -20, 110, 0, Math.PI * 2); ctx.fill();
  }
  shadow(ctx, 6, 8, w.r * 0.8, w.r * 0.34);
  // två resta stenar med ett tvärstycke — en port, inte bara en sten
  ctx.fillStyle = '#39445a';
  ctx.fillRect(-24, -66, 13, 70);
  ctx.fillRect(11, -66, 13, 70);
  ctx.fillRect(-26, -78, 52, 15);
  ctx.fillStyle = '#4a5772';
  ctx.fillRect(-26, -78, 52, 5);
  // runa
  ctx.strokeStyle = known ? '#a8e4f8' : '#4c5a70';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -60); ctx.lineTo(0, -22);
  ctx.moveTo(0, -52); ctx.lineTo(9, -44);
  ctx.moveTo(0, -38); ctx.lineTo(-9, -30);
  ctx.stroke();

  ctx.restore();
  worldLabel(ctx, known ? 'Vägsten' : 'Vägsten (orörd)', w.x, w.y - 92,
    known ? '#c8ecfb' : '#93a6c0', 13);
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
  ctx.translate(here.x, here.y);
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
  worldLabel(ctx, game.zone.isTown ? portal.zoneName : 'Frosthem', here.x, here.y - 88, '#c8ecfb', 13);
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawChests(ctx, game) {
  const t = performance.now() / 1000;
  for (const c of game.zone.chests ?? []) {
    ctx.save();
    ctx.translate(c.x, c.y);
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
    worldLabel(ctx, c.opened ? 'Tömd kista' : 'Kista', c.x, c.y - 44,
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
 * Text i världen med mörk kontur. Utan konturen försvinner den mot snön —
 * det var därför skyltarna kändes otydliga.
 * @param {CanvasRenderingContext2D} ctx @param {string} text
 * @param {number} x @param {number} y @param {string} color @param {number} [size] @param {number} [weight]
 */
function worldLabel(ctx, text, x, y, color, size = 13, weight = 600) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(4,7,12,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Den enda [E]-prompten. Ritas ovanför det spelaren faktiskt kan använda,
 * med tangenten som en egen tydlig knapp.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawInteractPrompt(ctx, game) {
  const it = game.interact;
  if (!it || game.player.dead) return;
  const t = performance.now() / 1000;
  const y = it.y + Math.sin(t * 2.4) * 2;
  ctx.save();
  ctx.font = '600 13px system-ui, sans-serif';
  const tw = ctx.measureText(it.label).width;
  const boxW = tw + 46, boxH = 26;
  const x = it.x - boxW / 2;
  ctx.fillStyle = 'rgba(6,10,17,0.88)';
  ctx.strokeStyle = 'rgba(216,178,106,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y - boxH, boxW, boxH, 5); ctx.fill(); ctx.stroke();
  // tangentkapsel
  ctx.fillStyle = '#d8b26a';
  ctx.beginPath(); ctx.roundRect(x + 6, y - boxH + 5, 17, 16, 3); ctx.fill();
  ctx.fillStyle = '#0b0f17';
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('E', x + 14.5, y - boxH + 13.5);
  ctx.fillStyle = '#f0e6cf';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(it.label, x + 30, y - boxH + 13.5);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} rx @param {number} ry @param {number} [a] */
function shadow(ctx, x, y, rx, ry, a = 0.32) {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#1a2434';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawPine(ctx, o) {
  const h = 46 + o.s * 34;
  shadow(ctx, o.x + 7, o.y + 4, o.r * 1.15, o.r * 0.5);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.fillStyle = '#3b2d24';
  ctx.fillRect(-2.5, -8, 5, 10);
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    const w = o.r * (1.25 - t * 0.42);
    const yTop = -h * (0.42 + t * 0.28) - 4;
    const yBot = -h * (t * 0.30) - 2;
    ctx.fillStyle = ['#163026', '#1c3a2d', '#224434'][i];
    ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(-w, yBot); ctx.lineTo(w, yBot); ctx.closePath(); ctx.fill();
    // snö på grenarna
    ctx.fillStyle = 'rgba(226,236,246,0.82)';
    ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(-w * 0.62, yBot - (yBot - yTop) * 0.34); ctx.lineTo(w * 0.5, yBot - (yBot - yTop) * 0.42); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawRock(ctx, o) {
  shadow(ctx, o.x + 5, o.y + 3, o.r * 1.1, o.r * 0.45);
  ctx.save();
  ctx.translate(o.x, o.y);
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
  shadow(ctx, o.x + 8, o.y + 3, o.r * 1.2, o.r * 0.42);
  ctx.save(); ctx.translate(o.x, o.y);
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

/** Brutet stenblock — kantigt och regelbundet, till skillnad från naturstenen. */
/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawQuarryBlock(ctx, o) {
  const h = o.r * 1.5;
  shadow(ctx, o.x + 7, o.y + 4, o.r * 1.1, o.r * 0.45);
  ctx.save();
  ctx.translate(o.x, o.y);
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
  shadow(ctx, o.x + 4, o.y + 2, o.r * 0.9, o.r * 0.4);
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.fillStyle = '#4a3a2c';
  ctx.beginPath(); ctx.moveTo(-o.r * 0.45, 0); ctx.lineTo(-o.r * 0.3, -34); ctx.lineTo(0, -44); ctx.lineTo(o.r * 0.3, -34); ctx.lineTo(o.r * 0.45, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(226,236,246,0.7)';
  ctx.beginPath(); ctx.moveTo(-o.r * 0.3, -34); ctx.lineTo(0, -44); ctx.lineTo(o.r * 0.3, -34); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawHearth(ctx, o) {
  const t = performance.now() / 1000;
  ctx.save(); ctx.translate(o.x, o.y);
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
  ctx.save();
  ctx.globalAlpha = 0.34; ctx.fillStyle = '#1a2434';
  ctx.fillRect(o.x + 10, o.y + 8, o.w, o.h);
  ctx.globalAlpha = 1;
  // väggar
  ctx.fillStyle = '#3c3128';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = '#2e261e';
  for (let y = o.y + 8; y < o.y + o.h; y += 11) ctx.fillRect(o.x, y, o.w, 2);
  // tak (snötäckt)
  ctx.fillStyle = '#e6eef7';
  ctx.beginPath();
  ctx.moveTo(o.x - 10, o.y + 6); ctx.lineTo(o.x + o.w / 2, o.y - roofH);
  ctx.lineTo(o.x + o.w + 10, o.y + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(150,168,190,0.5)';
  ctx.beginPath();
  ctx.moveTo(o.x + o.w / 2, o.y - roofH); ctx.lineTo(o.x + o.w + 10, o.y + 6); ctx.lineTo(o.x + o.w / 2, o.y + 6); ctx.closePath(); ctx.fill();
  // fönster med varmt ljus
  const t = performance.now() / 1000;
  const glow = 0.6 + Math.sin(t * 2 + o.s * 9) * 0.12;
  ctx.fillStyle = `rgba(255,190,110,${glow})`;
  ctx.fillRect(o.x + o.w * 0.28, o.y + o.h * 0.42, 15, 13);
  ctx.fillRect(o.x + o.w * 0.62, o.y + o.h * 0.42, 15, 13);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {any} o */
function drawRuin(ctx, o) {
  ctx.save();
  ctx.globalAlpha = 0.32; ctx.fillStyle = '#1a2434';
  ctx.fillRect(o.x + 8, o.y + 6, o.w, o.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#332b22';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  // trasig takås: bara stumpar kvar
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
  shadow(ctx, n.x, n.y + 2, 13, 6);
  ctx.save(); ctx.translate(n.x, n.y + Math.sin(t * 1.6 + n.x) * 1.2);
  ctx.fillStyle = '#5b4a3a';
  ctx.beginPath(); ctx.moveTo(-11, 4); ctx.quadraticCurveTo(0, -28, 11, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8c2a0';
  ctx.beginPath(); ctx.arc(0, -26, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d3128';
  ctx.beginPath(); ctx.arc(0, -29, 7, Math.PI, 0); ctx.fill();
  ctx.restore();

  const near = Math.hypot(game.player.pos.x - n.x, game.player.pos.y - n.y) < 115;
  worldLabel(ctx, n.name, n.x, n.y - 44, near ? '#e8c88a' : '#c2d2e6', 13);
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawShrines(ctx, game) {
  const t = performance.now() / 1000;
  for (const s of game.zone.shrines) {
    ctx.save(); ctx.translate(s.x, s.y);
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

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawExits(ctx, game) {
  const t = performance.now() / 1000;
  for (const e of game.zone.exits) {
    ctx.save(); ctx.translate(e.x, e.y);
    const pulse = 0.4 + Math.sin(t * 1.8) * 0.18;
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, e.r * 1.5);
    g.addColorStop(0, `rgba(140,214,244,${pulse})`); g.addColorStop(1, 'rgba(140,214,244,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(170,226,250,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    worldLabel(ctx, e.label, e.x, e.y - e.r * 0.5 - 16, '#c8ecfb', 13);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawGroundItems(ctx, game) {
  const t = performance.now() / 1000;
  for (const g of game.ground) {
    const bob = Math.sin(t * 3 + g.x) * 2;
    ctx.save(); ctx.translate(g.x, g.y + bob);
    const col = g.kind === 'gold' ? '#d8b26a' : g.kind === 'potion' ? '#e05a72' : RARITY_COLOR[g.item.rarity];
    const rr = g.kind === 'item' && (g.item.rarity === 'unique' || g.item.rarity === 'rare') ? 44 : 26;
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, rr);
    grad.addColorStop(0, col + '99'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
    ctx.font = '15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(g.kind === 'gold' ? '🪙' : g.kind === 'potion' ? '🧪' : g.item.base.icon, 0, 0);
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
 * Markör runt den fiende auto-siktet valt. Utan den vet man inte var slaget
 * kommer att landa, och auto-sikte blir gissningslek i stället för avlastning.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
function drawAimTarget(ctx, game) {
  const m = game.aimTarget;
  if (!m || m.dead || game.player.dead) return;
  const t = performance.now() / 1000;
  const r = m.radius + 9 + Math.sin(t * 4) * 1.5;
  ctx.save();
  ctx.translate(m.pos.x, m.pos.y);
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
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(-11, -1.5, 22, 3);
    ctx.fillStyle = '#9aa8bd';
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(5, -4); ctx.lineTo(5, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* ---------------- entiteter ---------------- */

/** @param {CanvasRenderingContext2D} ctx @param {any} m @param {any} game */
function drawMonster(ctx, m, game) {
  const t = performance.now() / 1000;
  if (m.dead) {
    ctx.save();
    ctx.globalAlpha = clamp(m.corpseT / 14, 0, 1) * 0.5;
    ctx.fillStyle = '#2b1c22';
    ctx.beginPath(); ctx.ellipse(m.pos.x, m.pos.y, m.radius * 1.3, m.radius * 0.6, m.facing, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  const wob = Math.sin((m.walk ?? 0) * 6) * 2;
  if (m.shape !== 'wraith') shadow(ctx, m.pos.x, m.pos.y + m.radius * 0.35, m.radius * 1.05, m.radius * 0.42);

  ctx.save();
  ctx.translate(m.pos.x, m.pos.y);

  // aura för elit / frost
  if (m.elite) {
    const g = ctx.createRadialGradient(0, 0, m.radius * 0.4, 0, 0, m.radius * 2.6);
    g.addColorStop(0, m.elite.color + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, m.radius * 2.6, 0, Math.PI * 2); ctx.fill();
  }
  if (m.windup > 0) {
    ctx.strokeStyle = 'rgba(255,120,120,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, m.radius + 7, m.facing - 0.6, m.facing + 0.6); ctx.stroke();
  }

  const flash = m.hitFlash > 0;
  const frozen = m.freezeT > 0;
  const body = flash ? '#ffffff' : frozen ? '#a8dcf0' : m.def.color;
  const dark = flash ? '#ffd0d0' : frozen ? '#6ab0cc' : m.def.color2;

  ctx.rotate(m.facing);

  // Mörk siluett bakom kroppen: utan den försvinner fienderna i snön.
  if (m.shape !== 'wraith') {
    ctx.fillStyle = 'rgba(9,14,22,0.92)';
    if (m.shape === 'wolf') {
      ctx.beginPath(); ctx.ellipse(0, 0, m.radius * 1.58, m.radius * 0.98, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(m.radius * 1.05, 0, m.radius * 0.68, m.radius * 0.58, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, m.radius * (m.shape === 'boss' ? 1.22 : 1.02), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (m.shape === 'wolf') {
    ctx.fillStyle = dark;
    for (let i = 0; i < 4; i++) {
      const lx = i < 2 ? m.radius * 0.5 : -m.radius * 0.5;
      const ly = (i % 2 ? 1 : -1) * m.radius * 0.5;
      ctx.fillRect(lx - 2, ly - 2 + Math.sin((m.walk ?? 0) * 8 + i * 1.7) * 2.5, 4, 5);
    }
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, m.radius * 1.35, m.radius * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(m.radius * 1.05, 0, m.radius * 0.5, m.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-m.radius * 1.3, 0); ctx.lineTo(-m.radius * 2.1, -4); ctx.lineTo(-m.radius * 1.9, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffb03a';
    ctx.beginPath(); ctx.arc(m.radius * 1.2, -3.5, 1.7, 0, 6.3); ctx.arc(m.radius * 1.2, 3.5, 1.7, 0, 6.3); ctx.fill();
  } else if (m.shape === 'wraith') {
    ctx.globalAlpha = 0.85;
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, m.radius * 1.8);
    g.addColorStop(0, body); g.addColorStop(1, 'rgba(60,130,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, m.radius * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(m.radius * 0.7, 0);
    ctx.quadraticCurveTo(0, -m.radius, -m.radius, -m.radius * 0.5 + wob);
    ctx.quadraticCurveTo(-m.radius * 0.4, 0, -m.radius, m.radius * 0.5 - wob);
    ctx.quadraticCurveTo(0, m.radius, m.radius * 0.7, 0);
    ctx.fill();
    ctx.fillStyle = '#dff4ff';
    ctx.beginPath(); ctx.arc(m.radius * 0.35, -3, 2, 0, 6.3); ctx.arc(m.radius * 0.35, 3, 2, 0, 6.3); ctx.fill();
  } else if (m.shape === 'boss') {
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, 0, m.radius * 1.05, m.radius * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(m.radius * 0.15, 0, m.radius * 0.75, m.radius * 0.68, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dff4ff';
    for (let i = 0; i < 7; i++) {
      const a = -1.5 + i * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * m.radius * 0.8, Math.sin(a) * m.radius * 0.8);
      ctx.lineTo(Math.cos(a) * m.radius * 1.6, Math.sin(a) * m.radius * 1.55);
      ctx.lineTo(Math.cos(a + 0.16) * m.radius * 0.85, Math.sin(a + 0.16) * m.radius * 0.85);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#8ce8ff';
    ctx.beginPath(); ctx.arc(m.radius * 0.55, -7, 3.4, 0, 6.3); ctx.arc(m.radius * 0.55, 7, 3.4, 0, 6.3); ctx.fill();
  } else {
    ctx.fillStyle = dark;
    ctx.fillRect(-m.radius * 0.2, -m.radius * 0.75 + Math.sin((m.walk ?? 0) * 7) * 2, m.radius * 0.5, m.radius * 0.7);
    ctx.fillRect(-m.radius * 0.2, m.radius * 0.15 - Math.sin((m.walk ?? 0) * 7) * 2, m.radius * 0.5, m.radius * 0.7);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, m.radius * 0.82, m.radius * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(m.radius * 0.5, 0, m.radius * 0.42, 0, Math.PI * 2); ctx.fill();
    if (m.ai === 'ranged') { ctx.fillStyle = '#8a7050'; ctx.fillRect(m.radius * 0.3, -1.5, m.radius * 1.5, 3); }
  }
  ctx.restore();

  // status-ikoner / hälsobar
  const showBar = m.elite || m.isChampion || m.isBoss || m.hp < m.maxHp;
  if (showBar) {
    const w = m.isBoss ? 90 : m.radius * 2.4;
    const y = m.pos.y - m.radius - (m.isBoss ? 26 : 14);
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,17,0.8)';
    ctx.fillRect(m.pos.x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = m.isBoss ? '#c8354a' : m.elite ? m.elite.color : '#a8202a';
    ctx.fillRect(m.pos.x - w / 2, y, w * clamp(m.hp / m.maxHp, 0, 1), 3);
    ctx.restore();
  }
  if (m.freezeT > 0 || m.stunT > 0) {
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '12px system-ui';
    ctx.fillText(m.freezeT > 0 ? '❄️' : '💫', m.pos.x, m.pos.y - m.radius - 20);
    ctx.restore();
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
function drawPlayer(ctx, game) {
  const p = game.player;
  const t = performance.now() / 1000;

  if (p.dead) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#2b1c22';
    ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y, 20, 11, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  shadow(ctx, p.pos.x, p.pos.y + 6, 14, 6, 0.38);

  // Rimfrostaura
  if ((p.skills.rimeaura ?? 0) > 0) {
    ctx.save();
    const g = ctx.createRadialGradient(p.pos.x, p.pos.y, 30, p.pos.x, p.pos.y, 150);
    g.addColorStop(0, 'rgba(127,212,240,0.10)'); g.addColorStop(1, 'rgba(127,212,240,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, 150, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);

  // svep-animation
  if (p.swing) {
    const k = p.swing.t / p.swing.dur;
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.7;
    const spread = p.swing.arc / 2;
    const a0 = p.swing.dir - spread + p.swing.arc * k * 0.55;
    ctx.strokeStyle = p.swing.kind === 'rend' ? '#e0566a' : p.swing.kind === 'shatter' ? '#8fd8f4' : '#e8f0fa';
    ctx.lineWidth = 5 * (1 - k) + 1.5;
    ctx.beginPath(); ctx.arc(0, 0, p.swing.reach * (0.65 + k * 0.35), a0, a0 + p.swing.arc * 0.7); ctx.stroke();
    ctx.restore();
  }
  if (p.whirl) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#e8f0fa'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 46 + i * 12, t * 22 + i * 2, t * 22 + i * 2 + 2.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  const bob = Math.sin(p.walkPhase * 8) * 1.6;
  if (p.roll) {
    // Under rullningen ritas figuren hopkurad och roterad — läsbar signal om
    // att man är osårbar just nu.
    const k = 1 - p.roll.t / p.roll.dur;
    ctx.rotate(p.roll.dir + k * Math.PI * 2);
    const squash = 1 - Math.sin(k * Math.PI) * 0.38;
    ctx.scale(squash, 1 / squash);
    ctx.globalAlpha = 0.92;
  } else {
    ctx.rotate(p.facing);
  }

  // Mörk siluett — spelaren måste gå att hitta i en hop på vit mark.
  ctx.fillStyle = 'rgba(8,13,20,0.95)';
  ctx.beginPath(); ctx.ellipse(-2, bob * 0.3, 17, 14.5, 0, 0, Math.PI * 2); ctx.fill();
  // ben
  ctx.fillStyle = '#232a36';
  ctx.fillRect(-3, -8 + Math.sin(p.walkPhase * 8) * 3, 9, 6);
  ctx.fillRect(-3, 2 - Math.sin(p.walkPhase * 8) * 3, 9, 6);
  // mantel
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#1f4258';
  ctx.beginPath(); ctx.ellipse(-4, bob * 0.3, 13, 11, 0, 0, Math.PI * 2); ctx.fill();
  // kropp (varm läderton — enda varma färgen bland fienderna)
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#c2a678';
  ctx.beginPath(); ctx.ellipse(1, bob * 0.3, 10.5, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#d8b26a';
  ctx.beginPath(); ctx.ellipse(1, bob * 0.3, 10.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  // huvud
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#e8d3ae';
  ctx.beginPath(); ctx.arc(5.5, bob * 0.3, 5.6, 0, Math.PI * 2); ctx.fill();
  // vapen
  const w = p.equipment.weapon;
  if (w) {
    ctx.save();
    const sw = p.swing ? Math.sin((p.swing.t / p.swing.dur) * Math.PI) * 0.9 : 0;
    ctx.rotate(-0.5 + sw);
    ctx.fillStyle = '#6b5238'; ctx.fillRect(6, -1.5, 16, 3);
    ctx.fillStyle = w.rarity === 'unique' ? '#c08a3e' : w.rarity === 'rare' ? '#e8d15a' : '#c8d4e2';
    ctx.beginPath(); ctx.moveTo(20, -7); ctx.lineTo(30, -3); ctx.lineTo(30, 3); ctx.lineTo(20, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // riktningsmarkör mot muspekaren
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#cfe4f2'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y, 26, p.facing - 0.25, p.facing + 0.25);
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
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.vx * 0.01);
      ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2); ctx.fill();
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
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
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
  // kall färgton
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = zone.theme === 'barrow' ? 'rgba(150,170,210,1)' : 'rgba(186,200,224,1)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Minimap med fog of war.
 *
 * Ritas i skärmens faktiska upplösning (annars blir den suddig på en
 * retina-panel) och med tre tydligt skilda toner: utforskad mark, dimma, och
 * utanför zonen. Ordningen spelar roll — allt ritas först, sedan målas det du
 * inte besökt över. Fienderna ritas *efter* dimman men bara nära dig: kartan
 * minns terräng, inte var monstren står.
 * @param {CanvasRenderingContext2D} ctx @param {any} game
 */
export function renderMinimap(ctx, game) {
  const canvas = ctx.canvas;
  const S = canvas.clientWidth || 180;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(S * dpr)) {
    canvas.width = canvas.height = Math.round(S * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const zone = game.zone;
  const sc = Math.min(S / zone.w, S / zone.h);
  const offX = (S - zone.w * sc) / 2, offY = (S - zone.h * sc) / 2;
  const wx = (/** @type {number} */ x) => offX + x * sc;
  const wy = (/** @type {number} */ y) => offY + y * sc;

  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#05080e';           // utanför zonen
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#243448';           // utforskad mark
  ctx.fillRect(offX, offY, zone.w * sc, zone.h * sc);

  // hinder, skalade efter sin verkliga storlek
  ctx.fillStyle = '#3d5271';
  for (const o of zone.obstacles) {
    if (o.type === 'drift') continue;
    if (o.kind === 'circle') {
      const r = Math.max(0.7, o.r * sc);
      ctx.fillRect(wx(o.x) - r, wy(o.y) - r, r * 2, r * 2);
    } else ctx.fillRect(wx(o.x), wy(o.y), Math.max(1, o.w * sc), Math.max(1, o.h * sc));
  }
  if (zone.roads) {
    ctx.strokeStyle = 'rgba(186,204,228,0.7)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const road of zone.roads) {
      ctx.lineWidth = road.main ? 2.6 : 1.6;
      ctx.beginPath();
      road.pts.forEach((/** @type {any} */ pt, /** @type {number} */ i) =>
        i ? ctx.lineTo(wx(pt.x), wy(pt.y)) : ctx.moveTo(wx(pt.x), wy(pt.y)));
      ctx.stroke();
    }
  }
  /** @param {number} x @param {number} y @param {string} color @param {number} r */
  const pip = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(wx(x), wy(y), r, 0, 6.3); ctx.fill();
  };
  for (const e of zone.exits) pip(e.x, e.y, '#7fd4f0', 3);
  for (const sh of zone.shrines) if (!sh.used) pip(sh.x, sh.y, '#e0a86a', 2.5);
  for (const c of zone.chests ?? []) if (!c.opened) pip(c.x, c.y, '#d8b26a', 2.8);
  if (zone.waypoint) {
    ctx.fillStyle = game.waypoints.has(zone.index) ? '#a8e4f8' : '#5a6a80';
    ctx.fillRect(wx(zone.waypoint.x) - 2.5, wy(zone.waypoint.y) - 2.5, 5, 5);
  }

  // ---- dimman: måla över det du inte sett ---------------------------------
  if (zone.fog) {
    const cw = FOG_CELL * sc;
    ctx.fillStyle = '#0a0f18';
    for (let gy = 0; gy < zone.fogH; gy++) {
      let run = -1;
      for (let gx = 0; gx <= zone.fogW; gx++) {
        const hidden = gx < zone.fogW && zone.fog[gy * zone.fogW + gx] === 0;
        if (hidden) { if (run < 0) run = gx; }
        else if (run >= 0) {
          // Hela sjok i taget i stället för ruta för ruta.
          ctx.fillRect(wx(run * FOG_CELL), wy(gy * FOG_CELL), (gx - run) * cw + 0.6, cw + 0.6);
          run = -1;
        }
      }
    }
  }

  // ---- fiender: bara de du rimligen kan uppfatta just nu ------------------
  const px = game.player.pos.x, py = game.player.pos.y;
  for (const m of game.monsters) {
    if (m.dead) continue;
    if (Math.hypot(m.pos.x - px, m.pos.y - py) > 620) continue;
    pip(m.pos.x, m.pos.y, m.isBoss ? '#ff4a5a' : m.elite ? m.elite.color : '#c04a54',
      m.isBoss ? 4 : m.elite ? 3 : 1.8);
  }

  // ---- du själv, med blickriktning ---------------------------------------
  ctx.save();
  ctx.translate(wx(px), wy(py));
  ctx.rotate(game.player.facing);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-3.5, -3.6); ctx.lineTo(-1.5, 0); ctx.lineTo(-3.5, 3.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
