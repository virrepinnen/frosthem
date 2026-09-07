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

/**
 * @typedef {Object} Flake
 * @property {number} bx  Grundläge i sidled; vinden bär det här, inte ritläget
 * @property {number} y
 * @property {number} z     Djup: 0 långt bort, 1 nära
 * @property {number} size
 * @property {number} fall  Fallhastighet i px/s
 * @property {number} drag  Hur hårt vinden tar — små flingor kastas mest
 * @property {number} swayAmp @property {number} swayFreq @property {number} swayPhase
 * @property {number} bobFreq @property {number} bobPhase
 * @property {number} spin @property {number} spinSpeed
 */
/** @type {Flake[]} */
let menuFlakes = [];
let menuLast = 0;

/**
 * En flinga med helt egna tal. Poängen är att inga två ska röra sig lika:
 * storleken avgör både fallhastighet och hur mycket vinden rår på den, och
 * varje flinga har sin egen svängning och sin egen långsamma fartvariation.
 * @param {number} w @param {number} h @param {boolean} anywhere
 */
function makeFlake(w, h, anywhere) {
  // Kvadraten gör att de flesta flingor ligger långt bort — djupet blir tätare
  // bakåt, vilket är så ett snöfall faktiskt ser ut.
  const z = 0.12 + Math.pow(Math.random(), 1.7) * 0.88;
  const size = (0.5 + Math.random() * 3.1) * (0.4 + z * 1.05);
  return {
    bx: Math.random() * (w + 200) - 100,
    y: anywhere ? Math.random() * h : -10 - Math.random() * 60,
    z, size,
    // tyngre flingor faller fortare, och närmare flingor rör sig fortare
    fall: (11 + size * 21) * (0.5 + z * 1.05),
    // liten och lätt = kastas mest av vinden
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
    // långt bort: bara en prick
    x.beginPath(); x.arc(px, py, f.size, 0, Math.PI * 2); x.fill();
    return;
  }
  // nära: en liten sexuddig stjärna som tumlar
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

  // Byig vind: tre svängningar i olika takt ger stötar i stället för jämn drift.
  const gust = Math.sin(t * 0.21) * 150 + Math.sin(t * 0.071) * 105 + Math.sin(t * 0.53 + 1.7) * 45;

  mbx.clearRect(0, 0, w, h);

  // draggande slöjor av yrsnö längst bak
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
    // egen långsam fartvariation, så flingorna inte faller i takt
    const speedMod = 1 + Math.sin(t * f.bobFreq + f.bobPhase) * 0.38;
    f.y += f.fall * speedMod * dt;
    f.bx += gust * f.drag * dt;
    f.spin += f.spinSpeed * dt;

    const px = f.bx + Math.sin(t * f.swayFreq + f.swayPhase) * f.swayAmp;
    if (f.y > h + 12) { Object.assign(f, makeFlake(w, h, false)); continue; }
    if (px > w + 40) f.bx -= w + 80;
    if (px < -40) f.bx += w + 80;

    // Nära flingor är ljusare och får ett mjukt sken; långt bort tonar de bort.
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
