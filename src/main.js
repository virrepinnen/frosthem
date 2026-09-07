// @ts-check
import { createGame } from './game.js';
import { createPlayer } from './entities/player.js';
import { initInput, endFrameInput, keyPressed, setInputEnabled } from './core/input.js';
import { camera, PROJ } from './render/camera.js';
import { initRenderer, render, renderMinimap } from './render/renderer.js';
import { updateHud, rebuildSkillbar, initNav, showTutorial, openHelp } from './ui/hud.js';
import { renderPanels, anyPanelOpen, closeAllPanels } from './ui/panels.js';
import { moveTooltip, hideTooltip } from './ui/tooltip.js';
import { listSaves, deleteSave, playerFromSave, describeSave, saveGame } from './systems/save.js';

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
  // Marken är hoptryckt, så samma skärmhöjd rymmer mer värld i djupled.
  camera.h = innerHeight / camera.zoom / PROJ;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, 0, 0);
  ctx.imageSmoothingEnabled = true;
  initRenderer(camera.w, camera.h);
}
addEventListener('resize', resize);
resize();
initInput(canvas);
setInputEnabled(false); // menyn äger tangentbordet tills ett spel startar

addEventListener('mousemove', (e) => moveTooltip(e.clientX, e.clientY));
canvas.addEventListener('mouseenter', hideTooltip);

/* ------------------------------------------------------------------ */
/* Startskärm: karaktärslista och klassval                             */
/* ------------------------------------------------------------------ */

/** @type {ReturnType<typeof createGame>|null} */
let game = null;
/**
 * Varje bildruteloop får en egen bricka. Startas ett nytt spel höjs brickan och
 * gamla loopar avslutar sig själva. Utan det kunde ett dubbelklick på
 * "Börja vandringen" starta två spel som ritade om vartannat — det syntes som
 * ett flimmer, och den ena loopens ruta blev hängande över skärmen.
 */
let loopToken = 0;
let starting = false;

/** Klasser. Bara Barbaren finns — de andra visas för att visa vart det bär. */
const CLASSES = [
  { id: 'barbarian', icon: '🪓', name: 'Barbar', tag: 'Närstrid · Stål · Frost · Uthållighet',
    desc: 'Tar smällen på nära håll. Börjar med ingenting och blir det du utrustar den till.',
    ready: true },
  { id: 'hunter', icon: '🏹', name: 'Jägaren', tag: 'Distans · kommer senare',
    desc: 'Håller avstånd och lever på att aldrig bli omringad.', ready: false },
  { id: 'frostcaller', icon: '❄️', name: 'Frostkallaren', tag: 'Magi · kommer senare',
    desc: 'Vänder vintern mot dem som lever i den.', ready: false },
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
    empty.textContent = 'Ingen vandrare än. Skapa en så börjar vi i Frosthem.';
    host.appendChild(empty);
    return;
  }
  for (const rec of saves) {
    const info = describeSave(rec);
    const row = document.createElement('div');
    row.className = 'char-row';
    row.innerHTML =
      `<div class="char-lvl">${rec.level ?? 1}</div>` +
      `<div class="char-t"><b>${escapeHtml(rec.name ?? 'Barbaren')}</b>` +
      `<i>${info.kills} fällda · ${info.gold} guld · ${info.deaths} dödsfall<br>Senast spelad ${info.rel}</i></div>` +
      '<div class="char-del" title="Radera">✕</div>';
    row.onclick = () => {
      begin(playerFromSave(rec), {
        waypoints: rec.waypoints ?? [0],
        bossDefeated: rec.bossDefeated ?? false,
      }, false, rec.id);
    };
    /** @type {HTMLElement} */ (row.querySelector('.char-del')).onclick = (e) => {
      e.stopPropagation();
      // Att radera en karaktär går inte att ångra, så det kräver ett andra klick.
      const el = /** @type {HTMLElement} */ (e.currentTarget);
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1';
        el.textContent = 'Säker?';
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
    card.innerHTML = `<div class="cc-ico">${c.icon}</div><div class="cc-t">` +
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

// Finns inga karaktärer är listan bara ett tomt rum — gå direkt till skapandet.
if (listSaves().length) showList(); else showCreate();

/* ------------------------------------------------------------------ */
/* Snöstorm bakom menyn                                                */
/* ------------------------------------------------------------------ */

const menuCanvas = /** @type {HTMLCanvasElement} */ ($('menu-bg'));
const mbx = /** @type {CanvasRenderingContext2D} */ (menuCanvas.getContext('2d'));
/** @type {{x:number,y:number,z:number,r:number}[]} */
let menuFlakes = [];

function menuStorm() {
  if ($('start').classList.contains('hidden')) return; // menyn stängd: sluta rita
  requestAnimationFrame(menuStorm);
  const w = menuCanvas.width = menuCanvas.clientWidth;
  const h = menuCanvas.height = menuCanvas.clientHeight;
  if (!w || !h) return;
  if (menuFlakes.length !== 420) {
    menuFlakes = Array.from({ length: 420 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      z: 0.25 + Math.random() * 0.75, r: 0.7 + Math.random() * 2.6,
    }));
  }
  const t = performance.now() / 1000;
  // Byiga vindar: två sinusvågor i olika takt ger stötar i stället för jämn drift.
  const wind = 210 + Math.sin(t * 0.31) * 150 + Math.sin(t * 0.11) * 90;

  mbx.clearRect(0, 0, w, h);
  // draggande slöjor av yrsnö längst bak
  mbx.save();
  for (let i = 0; i < 3; i++) {
    const y = ((t * (24 + i * 16) + i * h / 3) % (h + 300)) - 150;
    const g = mbx.createLinearGradient(0, y - 90, 0, y + 90);
    g.addColorStop(0, 'rgba(190,208,232,0)');
    g.addColorStop(0.5, `rgba(190,208,232,${0.035 + i * 0.012})`);
    g.addColorStop(1, 'rgba(190,208,232,0)');
    mbx.fillStyle = g;
    mbx.fillRect(0, y - 90, w, 180);
  }
  mbx.restore();

  mbx.fillStyle = '#e8f2fb';
  for (const f of menuFlakes) {
    f.y += (26 + f.z * 70) * 0.016;
    f.x += wind * f.z * 0.016;
    if (f.y > h + 6) { f.y = -6; f.x = Math.random() * (w + 200) - 100; }
    if (f.x > w + 8) f.x = -8;
    if (f.x < -8) f.x = w + 8;
    mbx.globalAlpha = 0.12 + f.z * 0.5;
    // Strecken lutar med vinden, så snön ser driven ut i stället för fallande.
    mbx.beginPath();
    mbx.ellipse(f.x, f.y, f.r * f.z * 2.4, f.r * f.z, Math.atan2(1, wind / 90), 0, Math.PI * 2);
    mbx.fill();
  }
  mbx.globalAlpha = 1;
}
requestAnimationFrame(menuStorm);

/**
 * @param {ReturnType<typeof createPlayer>} player
 * @param {{waypoints?:number[], bossDefeated?:boolean}} [progress]
 * @param {boolean} isNew
 * @param {string} [charId]
 */
function begin(player, progress, isNew, charId) {
  if (starting) return;   // dubbelklick, eller Enter ovanpå ett klick
  starting = true;
  $('start').classList.add('hidden');
  // Man återvänder alltid till Frosthem — byn är den enda plats som inte
  // genereras om, och därför den enda som går att spara en position i.
  game = createGame(player, { ...progress, zoneIndex: 0, charId });
  /** @type {any} */ (window).game = game;
  rebuildSkillbar(game);
  initNav(game);
  game.paused = true;

  // Ren skiffer. Ingen ruta, ingen panel och ingen tangent från menyn får
  // följa med in i spelet — det var så bokstäverna i karaktärsnamnet kunde
  // öppna väskan i samma stund som spelet startade.
  for (const id of ['overlay', 'pause', 'levelup', 'tutorial']) $(id).classList.add('hidden');
  closeAllPanels(game);
  game.dropPending();
  /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
  setInputEnabled(true);

  const resume = () => { if (game) game.paused = false; };
  if (isNew && !localStorage.getItem(TUTORIAL_KEY)) {
    // Första karaktären får den korta genomgången; därefter når man den via ?.
    showTutorial(() => { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* privat läge */ } resume(); });
  } else {
    // Ingen modal vid start. Att behöva klicka bort en ruta varje gång man
    // sätter sig är ren friktion — det som behöver sägas ryms i en notis.
    resume();
    game.alert(isNew
      ? `${player.name} står i Frosthem. Följ stigen norrut.`
      : `Välkommen tillbaka, ${player.name}. Nivå ${player.level}.`);
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
  if (token !== loopToken) return;   // en äldre loop: låt den dö ut
  requestAnimationFrame((t) => frame(t, token));
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
  if (keyPressed('f1')) openHelp(game);
  if (keyPressed('f2')) {
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
