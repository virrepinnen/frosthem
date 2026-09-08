// @ts-check
import { createGame } from './game.js';
import { createPlayer, bindToHotbar } from './entities/player.js';
import { initInput, endFrameInput, keyPressed, setInputEnabled } from './core/input.js';
import { camera, PROJ } from './render/camera.js';
import { initRenderer, render, renderMinimap } from './render/renderer.js';
import { updateHud, rebuildSkillbar, initNav, showTutorial, openHelp } from './ui/hud.js';
import { glyph } from './ui/glyphs.js';
import { T, loadKnobs } from './systems/tuning.js';
import { rollItem } from './systems/loot.js';
import { recalc, xpToNext } from './systems/stats.js';
import { renderPanels, anyPanelOpen, closeAllPanels } from './ui/panels.js';
import { moveTooltip, hideTooltip } from './ui/tooltip.js';
import { listSaves, deleteSave, playerFromSave, describeSave, saveGame } from './systems/save.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const canvas = /** @type {HTMLCanvasElement} */ ($('game'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
const mini = /** @type {HTMLCanvasElement} */ ($('minimap'));
const mctx = /** @type {CanvasRenderingContext2D} */ (mini.getContext('2d'));

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  // The zoom lives in the base transform: the world is drawn in world
  // coordinates, and the view in world units shrinks accordingly. We aim for a
  // fixed number of world units across the screen regardless of window size, so
  // the figures keep the same readable size on a small laptop as on a large
  // one. The number itself is a feel knob — see systems/tuning.js.
  camera.zoom = Math.max(0.7, Math.min(2.4, innerWidth / T.viewWidth));
  camera.w = innerWidth / camera.zoom;
  // The ground is squashed, so the same screen height holds more world in depth.
  camera.h = innerHeight / camera.zoom / PROJ;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, 0, 0);
  ctx.imageSmoothingEnabled = true;
  initRenderer(camera.w, camera.h);
}
// Feel knobs are read at resize, so they have to be loaded before the first one.
loadKnobs();
addEventListener('resize', resize);
resize();
initInput(canvas);
setInputEnabled(false); // the menu owns the keyboard until a game starts

addEventListener('mousemove', (e) => moveTooltip(e.clientX, e.clientY));
canvas.addEventListener('mouseenter', hideTooltip);

/* ------------------------------------------------------------------ */
/* Start screen: character list and class selection                    */
/* ------------------------------------------------------------------ */

/** @type {ReturnType<typeof createGame>|null} */
let game = null;
/**
 * Every frame loop gets its own token. Starting a new game bumps the token and
 * old loops end themselves. Without it a double click on "Begin the journey"
 * could start two games drawing over each other — which showed up as a flicker,
 * and one loop's window was left hanging over the screen.
 */
let loopToken = 0;
let starting = false;

/** Classes. Only the Barbarian exists — the others are shown to say where this is going. */
const CLASSES = [
  { id: 'barbarian', icon: 'axe', name: 'Barbarian', tag: 'Melee · Steel · Frost · Endurance',
    desc: 'Takes the hit up close. Starts with nothing and becomes whatever you equip.',
    ready: true },
  { id: 'hunter', icon: 'bow', name: 'Hunter', tag: 'Ranged · coming later',
    desc: 'Keeps her distance and lives on never being surrounded.', ready: false },
  { id: 'frostcaller', icon: 'wintergrasp', name: 'Frostcaller', tag: 'Magic · coming later',
    desc: 'Turns the winter against those who live in it.', ready: false },
];

const listView = $('char-list-view');
const createView = $('create-view');
const nameInput = /** @type {HTMLInputElement} */ ($('hero-name'));

function showList() {
  renderCharList();
  listView.classList.remove('hidden');
  createView.classList.add('hidden');
}

function showCreate() {
  renderClassList();
  listView.classList.add('hidden');
  createView.classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 60);
}

function renderCharList() {
  const host = $('char-list');
  host.innerHTML = '';
  const saves = listSaves();
  if (!saves.length) {
    const empty = document.createElement('div');
    empty.className = 'char-empty';
    empty.textContent = 'No wanderer yet. Make one and we begin in Frosthem.';
    host.appendChild(empty);
    return;
  }
  for (const rec of saves) {
    const info = describeSave(rec);
    const row = document.createElement('div');
    row.className = 'char-row';
    row.innerHTML =
      `<div class="char-lvl">${rec.level ?? 1}</div>` +
      `<div class="char-t"><b>${escapeHtml(rec.name ?? 'Barbarian')}</b>` +
      `<i>${info.kills} felled · ${info.gold} gold · ${info.deaths} deaths<br>Last played ${info.rel}</i></div>` +
      '<div class="char-del" title="Delete">✕</div>';
    row.onclick = () => {
      begin(playerFromSave(rec), {
        waypoints: rec.waypoints ?? [0],
        bossDefeated: rec.bossDefeated ?? false,
        runs: rec.runs ?? 0,
        bestDepth: rec.bestDepth ?? 0,
      }, false, rec.id);
    };
    /** @type {HTMLElement} */ (row.querySelector('.char-del')).onclick = (e) => {
      e.stopPropagation();
      // Deleting a character cannot be undone, so it takes a second click.
      const el = /** @type {HTMLElement} */ (e.currentTarget);
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1';
        el.textContent = 'Sure?';
        el.style.width = 'auto';
        el.style.padding = '0 7px';
        el.style.fontSize = '10px';
        setTimeout(() => {
          if (!el.isConnected) return;
          el.dataset.armed = ''; el.textContent = '✕';
          el.style.width = ''; el.style.padding = ''; el.style.fontSize = '';
        }, 3000);
        return;
      }
      deleteSave(rec.id);
      renderCharList();
    };
    host.appendChild(row);
  }
}

function renderClassList() {
  const host = $('class-list');
  host.innerHTML = '';
  for (const c of CLASSES) {
    const card = document.createElement('div');
    card.className = 'class-card' + (c.ready ? ' on' : ' locked');
    card.innerHTML = `<div class="cc-ico">${glyph(c.icon, 1.3)}</div><div class="cc-t">` +
      `<b>${c.name}</b><i>${c.tag}</i><span>${c.desc}</span></div>`;
    host.appendChild(card);
  }
}

/** @param {string} t */
function escapeHtml(t) {
  return String(t).replace(/[&<>"]/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** @type {HTMLButtonElement} */ ($('btn-newchar')).onclick = showCreate;
/** @type {HTMLButtonElement} */ ($('btn-back')).onclick = showList;
/** @type {HTMLButtonElement} */ ($('btn-new')).onclick = startNew;
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startNew(); });

function startNew() {
  const name = nameInput.value.trim() || 'Barbaren';
  begin(createPlayer(name), undefined, true);
}

$('btn-test').onclick = () => beginTest();

// With no characters the list is just an empty room — go straight to creation.
if (listSaves().length) showList(); else showCreate();

/* ------------------------------------------------------------------ */
/* Snowstorm behind the menu                                           */
/* ------------------------------------------------------------------ */

const menuCanvas = /** @type {HTMLCanvasElement} */ ($('menu-bg'));
const mbx = /** @type {CanvasRenderingContext2D} */ (menuCanvas.getContext('2d'));

/**
 * @typedef {Object} Flake
 * @property {number} bx  Base position sideways; the wind carries this, not the drawn one
 * @property {number} y
 * @property {number} z     Depth: 0 far away, 1 close
 * @property {number} size
 * @property {number} fall  Fallhastighet i px/s
 * @property {number} drag  How hard the wind grips — small flakes are thrown most
 * @property {number} swayAmp @property {number} swayFreq @property {number} swayPhase
 * @property {number} bobFreq @property {number} bobPhase
 * @property {number} spin @property {number} spinSpeed
 */
/** @type {Flake[]} */
let menuFlakes = [];
let menuLast = 0;

/**
 * A flake with entirely its own numbers. The point is that no two move alike:
 * the size decides both the fall speed and how much the wind can do to it, and
 * every flake has its own sway and its own slow variation in speed.
 * @param {number} w @param {number} h @param {boolean} anywhere
 */
function makeFlake(w, h, anywhere) {
  // Squaring puts most flakes far away — the depth is denser towards the back,
  // which is how a snowfall actually looks.
  const z = 0.12 + Math.pow(Math.random(), 1.7) * 0.88;
  const size = (0.5 + Math.random() * 3.1) * (0.4 + z * 1.05);
  return {
    bx: Math.random() * (w + 200) - 100,
    y: anywhere ? Math.random() * h : -10 - Math.random() * 60,
    z, size,
    // heavier flakes fall faster, and nearer flakes move faster
    fall: (11 + size * 21) * (0.5 + z * 1.05),
    // small and light = thrown most by the wind
    drag: (1.35 - Math.min(1, size / 3.2)) * (0.35 + z * 0.9),
    swayAmp: 4 + Math.random() * 30 * (1.25 - Math.min(1, size / 3.4)),
    swayFreq: 0.2 + Math.random() * 1.05,
    swayPhase: Math.random() * 6.283,
    bobFreq: 0.25 + Math.random() * 0.95,
    bobPhase: Math.random() * 6.283,
    spin: Math.random() * 6.283,
    spinSpeed: (Math.random() - 0.5) * 2.6,
  };
}

/** @param {CanvasRenderingContext2D} x @param {Flake} f @param {number} px @param {number} py */
function drawFlake(x, f, px, py) {
  if (f.size < 1.25) {
    // far away: just a dot
    x.beginPath(); x.arc(px, py, f.size, 0, Math.PI * 2); x.fill();
    return;
  }
  // close: a small six-pointed star, tumbling
  x.save();
  x.translate(px, py);
  x.rotate(f.spin);
  x.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = i * (Math.PI / 3);
    x.moveTo(-Math.cos(a) * f.size, -Math.sin(a) * f.size);
    x.lineTo(Math.cos(a) * f.size, Math.sin(a) * f.size);
  }
  x.lineWidth = Math.max(0.8, f.size * 0.45);
  x.lineCap = 'round';
  x.strokeStyle = x.fillStyle;
  x.stroke();
  x.beginPath(); x.arc(0, 0, f.size * 0.42, 0, Math.PI * 2); x.fill();
  x.restore();
}

/** @param {number} now */
function menuStorm(now) {
  if ($('start').classList.contains('hidden')) { menuLast = 0; return; }
  requestAnimationFrame(menuStorm);
  const w = menuCanvas.width = menuCanvas.clientWidth;
  const h = menuCanvas.height = menuCanvas.clientHeight;
  if (!w || !h) return;

  const dt = menuLast ? Math.min(0.05, (now - menuLast) / 1000) : 0.016;
  menuLast = now;
  const t = now / 1000;

  if (menuFlakes.length !== 380) {
    menuFlakes = Array.from({ length: 380 }, () => makeFlake(w, h, true));
  }

  // Gusting wind: three oscillations at different rates give gusts rather than steady drift.
  const gust = Math.sin(t * 0.21) * 150 + Math.sin(t * 0.071) * 105 + Math.sin(t * 0.53 + 1.7) * 45;

  mbx.clearRect(0, 0, w, h);

  // drifting veils of blown snow at the very back
  for (let i = 0; i < 3; i++) {
    const y = ((t * (22 + i * 15) + i * h / 3) % (h + 300)) - 150;
    const g = mbx.createLinearGradient(0, y - 95, 0, y + 95);
    g.addColorStop(0, 'rgba(190,208,232,0)');
    g.addColorStop(0.5, `rgba(190,208,232,${0.03 + i * 0.011})`);
    g.addColorStop(1, 'rgba(190,208,232,0)');
    mbx.fillStyle = g;
    mbx.fillRect(0, y - 95, w, 190);
  }

  for (const f of menuFlakes) {
    // its own slow speed variation, so the flakes do not fall in step
    const speedMod = 1 + Math.sin(t * f.bobFreq + f.bobPhase) * 0.38;
    f.y += f.fall * speedMod * dt;
    f.bx += gust * f.drag * dt;
    f.spin += f.spinSpeed * dt;

    const px = f.bx + Math.sin(t * f.swayFreq + f.swayPhase) * f.swayAmp;
    if (f.y > h + 12) { Object.assign(f, makeFlake(w, h, false)); continue; }
    if (px > w + 40) f.bx -= w + 80;
    if (px < -40) f.bx += w + 80;

    // Near flakes are brighter and get a soft glow; far ones fade away.
    if (f.size > 2.4) {
      mbx.globalAlpha = (0.05 + f.z * 0.1);
      mbx.fillStyle = '#dbe9f8';
      mbx.beginPath(); mbx.arc(px, f.y, f.size * 2.6, 0, Math.PI * 2); mbx.fill();
    }
    mbx.globalAlpha = 0.08 + Math.pow(f.z, 1.3) * 0.62;
    mbx.fillStyle = '#e8f2fb';
    drawFlake(mbx, f, px, f.y);
  }
  mbx.globalAlpha = 1;
}
requestAnimationFrame(menuStorm);

/**
 * The test session.
 *
 * Drops you straight into the wilderness with a character that can already
 * fight, skipping the menu, the walkthrough and the walk out of the village.
 * It saves nothing and touches none of your real characters — the whole point
 * is to be able to look at one thing twenty times in a row without any of the
 * game's ceremony in the way.
 *
 * Dying here puts you back on your feet where you stood. A test session never
 * ends.
 */
function beginTest() {
  const p = createPlayer('Testarn');
  p.level = 8;
  p.xpNext = xpToNext(8);
  p.skills = { cleave: 3, rend: 2, crush: 1, toughskin: 2, secondwind: 1 };
  for (const id of ['cleave', 'rend', 'crush']) bindToHotbar(p, id, false);
  for (const slot of /** @type {const} */ (['weapon', 'helm', 'chest', 'boots'])) {
    const it = rollItem(10, { mf: 0, boost: 2, slot });
    if (it) p.equipment[slot] = it;
  }
  p.gold = 4000;
  recalc(p);
  p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana;

  begin(p, { waypoints: [0, 1], bossDefeated: false }, false, undefined, true);
  game.testMode = true;
  game.travel(1);
  game.alert('Test session — F3 for the knobs. Nothing here is saved.');
}

/**
 * @param {ReturnType<typeof createPlayer>} player
 * @param {{waypoints?:number[], bossDefeated?:boolean, runs?:number, bestDepth?:number}} [progress]
 * @param {boolean} isNew
 * @param {string} [charId]
 * @param {boolean} [test]
 */
function begin(player, progress, isNew, charId, test) {
  if (starting) return;   // a double click, or Enter on top of a click
  starting = true;
  $('start').classList.add('hidden');
  // You always return to Frosthem — the village is the only place that is not
  // regenerated, and therefore the only one a position can be saved in.
  game = createGame(player, { ...progress, zoneIndex: 0, charId });
  /** @type {any} */ (window).game = game;
  rebuildSkillbar(game);
  initNav(game);
  game.paused = true;

  // Clean slate. No window, no panel and no key from the menu may follow you
  // into the game — that is how the letters in the character name could open the
  // bag the moment the game started.
  for (const id of ['overlay', 'pause', 'levelup', 'tutorial']) $(id).classList.add('hidden');
  closeAllPanels(game);
  game.dropPending();
  /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
  setInputEnabled(true);

  const resume = () => { if (game) game.paused = false; };
  if (test) {
    resume();
  } else if (isNew) {
    // Every new character gets the walkthrough. It used to sit behind a flag in
    // localStorage and only showed for the very first character ever — but a new
    // character is a new beginning, and five clicks are cheaper than missing it.
    // Existing characters get no window at all; `?` and `F1` are there.
    showTutorial(resume);
  } else {
    // No modal at start. Having to dismiss a window every time you sit down is
    // pure friction — what needs saying fits in a notice.
    resume();
    game.alert(isNew
      ? `${player.name} stands in Frosthem. Follow the path north.`
      : `Welcome back, ${player.name}. Level ${player.level}.`);
  }

  const myToken = ++loopToken;
  requestAnimationFrame((t) => frame(t, myToken));
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

let last = performance.now();
let acc = 0;
let hintT = 0;

/** @param {number} now @param {number} token */
function frame(now, token) {
  if (token !== loopToken) return;   // an older loop: let it die out
  requestAnimationFrame((t) => frame(t, token));
  if (!game) return;
  let dt = (now - last) / 1000;
  last = now;
  // Clamp: a tab switch must not teleport the whole world a step forward.
  dt = Math.min(dt, 1 / 20);

  game.update(dt);
  render(ctx, game, dt);
  updateHud(game);

  acc += dt;
  if (acc > 0.1) { acc = 0; renderMinimap(mctx, game); }

  if (game.dirtyUI) { renderPanels(game); game.dirtyUI = false; }
  document.body.style.cursor = anyPanelOpen() ? 'default' : 'crosshair';

  // The help text fades on its own, and F1 hides it entirely.
  hintT += dt;
  if (keyPressed('f1')) openHelp(game);
  if (keyPressed('f2')) {
    const h = $('hint');
    h.classList.toggle('show');
    h.classList.remove('faded');
  }
  if (hintT > 30) $('hint').classList.add('faded');

  endFrameInput();
}

// Save when the tab is left — otherwise you lose the last few minutes.
addEventListener('beforeunload', () => { if (game) saveGame(game); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && game) saveGame(game);
});
