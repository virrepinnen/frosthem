// @ts-check
import { createGame } from './game.js';
import { createPlayer } from './entities/player.js';
import { initInput, endFrameInput, keyPressed } from './core/input.js';
import { camera } from './render/camera.js';
import { initRenderer, render, renderMinimap } from './render/renderer.js';
import { updateHud, rebuildSkillbar, showOverlay, initNav, showTutorial } from './ui/hud.js';
import { renderPanels, anyPanelOpen } from './ui/panels.js';
import { moveTooltip, hideTooltip } from './ui/tooltip.js';
import { readSave, clearSave, playerFromSave, describeSave, saveGame } from './systems/save.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const TUTORIAL_KEY = 'frosthem.tutorial.v1';

const canvas = /** @type {HTMLCanvasElement} */ ($('game'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
const mini = /** @type {HTMLCanvasElement} */ ($('minimap'));
const mctx = /** @type {CanvasRenderingContext2D} */ (mini.getContext('2d'));

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  // Zoomen ligger i grundtransformen: världen ritas i världskoordinater, och
  // synfältet i världsenheter krymper i motsvarande grad. Vi siktar på ~820
  // världsenheter i bredd oavsett fönsterstorlek, så figurerna behåller samma
  // läsbara storlek på en liten laptop som på en stor skärm.
  camera.zoom = Math.max(1, Math.min(2.4, innerWidth / 820));
  camera.w = innerWidth / camera.zoom;
  camera.h = innerHeight / camera.zoom;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, 0, 0);
  ctx.imageSmoothingEnabled = true;
  initRenderer(camera.w, camera.h);
}
addEventListener('resize', resize);
resize();
initInput(canvas);

addEventListener('mousemove', (e) => moveTooltip(e.clientX, e.clientY));
canvas.addEventListener('mouseenter', hideTooltip);

/* ------------------------------------------------------------------ */
/* Startskärm                                                          */
/* ------------------------------------------------------------------ */

/** @type {ReturnType<typeof createGame>|null} */
let game = null;

const save = readSave();
if (save) {
  $('continue-card').classList.remove('hidden');
  $('save-line').textContent = describeSave(save);
  $('wipe-note').classList.remove('hidden');
  /** @type {HTMLButtonElement} */ ($('btn-continue')).onclick = () => {
    begin(playerFromSave(save), {
      waypoints: save.waypoints ?? [0],
      bossDefeated: save.bossDefeated ?? false,
    }, false);
  };
}

const nameInput = /** @type {HTMLInputElement} */ ($('hero-name'));
/** @type {HTMLButtonElement} */ ($('btn-new')).onclick = startNew;
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startNew(); });
if (!save) setTimeout(() => nameInput.focus(), 60);

function startNew() {
  clearSave();
  const name = nameInput.value.trim() || 'Vandraren';
  begin(createPlayer(name), undefined, true);
}

/**
 * @param {ReturnType<typeof createPlayer>} player
 * @param {{waypoints?:number[], bossDefeated?:boolean}} [progress]
 * @param {boolean} isNew
 */
function begin(player, progress, isNew) {
  $('start').classList.add('hidden');
  // Man återvänder alltid till Frosthem — byn är den enda plats som inte
  // genereras om, och därför den enda som går att spara en position i.
  game = createGame(player, { ...progress, zoneIndex: 0 });
  /** @type {any} */ (window).game = game;
  rebuildSkillbar(game);
  initNav(game);
  game.paused = true;

  const resume = () => { if (game) game.paused = false; };
  if (isNew && !localStorage.getItem(TUTORIAL_KEY)) {
    // Första karaktären får den korta genomgången; därefter aldrig igen.
    showTutorial(() => { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* privat läge */ } resume(); });
  } else if (isNew) {
    showOverlay('Frosthem',
      `${player.name} kommer till byn med en rostig yxa och ingenting annat.<br><br>` +
      'Följ stigen norrut. Rör vid vägstenen innan du går — då kan du resa tillbaka hit.',
      'Gå ut i kylan', resume);
  } else {
    showOverlay('Välkommen tillbaka',
      `${player.name}, nivå ${player.level}. Härden brinner ännu.`,
      'Fortsätt', resume);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

let last = performance.now();
let acc = 0;
let hintT = 0;

/** @param {number} now */
function frame(now) {
  requestAnimationFrame(frame);
  if (!game) return;
  let dt = (now - last) / 1000;
  last = now;
  // Klampa: en tabbväxling får inte teleportera hela världen ett steg framåt.
  dt = Math.min(dt, 1 / 20);

  game.update(dt);
  render(ctx, game, dt);
  updateHud(game);

  acc += dt;
  if (acc > 0.1) { acc = 0; renderMinimap(mctx, game); }

  if (game.dirtyUI) { renderPanels(game); game.dirtyUI = false; }
  document.body.style.cursor = anyPanelOpen() ? 'default' : 'crosshair';

  // Hjälptexten tonar ned av sig själv, och F1 döljer den helt.
  hintT += dt;
  if (keyPressed('f1')) {
    const h = $('hint');
    h.classList.toggle('show');
    h.classList.remove('faded');
  }
  if (hintT > 30) $('hint').classList.add('faded');

  endFrameInput();
}

// Spara när fliken lämnas — annars tappar man de senaste minuterna.
addEventListener('beforeunload', () => { if (game) saveGame(game); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && game) saveGame(game);
});
