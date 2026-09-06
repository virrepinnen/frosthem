// @ts-check
import { camera } from '../render/camera.js';
import { SKILL_BY_ID } from '../data/skills.js';
import { HOTBAR_SIZE } from '../entities/player.js';
import { showTextTooltip, hideTooltip, escape } from './tooltip.js';
import { panels, togglePanel, closeAllPanels, attrTooltip } from './panels.js';
import { recalc } from '../systems/stats.js';
import { saveGame } from '../systems/save.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

let lastGroundVersion = -1;
let lastHotbar = '';

/** @param {any} game */
export function updateHud(game) {
  const p = game.player;

  $('hp-fill').style.height = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  $('hp-text').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
  $('sta-fill').style.height = `${Math.max(0, (p.stamina / p.maxStamina) * 100)}%`;
  $('sta-text').textContent = `${Math.ceil(p.stamina)}/${p.maxStamina}`;
  const orb = $('sta-orb');
  orb.classList.toggle('low', !!p.exhausted);
  // Blinket startas om varje gång man försöker slå utan att orka.
  if (p.staminaFlash > 0.4 && !orb.classList.contains('flash')) {
    orb.classList.add('flash');
    setTimeout(() => orb.classList.remove('flash'), 460);
  }
  $('xp-fill').style.width = `${(p.xp / p.xpNext) * 100}%`;
  $('zone-name').textContent = game.zone.name;
  $('char-level').textContent = `Nivå ${p.level}`;
  $('gold').textContent = String(p.gold);

  updateNav(game);

  const sig = p.hotbar.join(',');
  if (sig !== lastHotbar) { rebuildSkillbar(game); lastHotbar = sig; }
  updateCooldowns(game);
  updateGroundLabels(game);
}

/** @param {any} game */
export function rebuildSkillbar(game) {
  const p = game.player;
  const bar = $('skillbar');
  bar.innerHTML = '';
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const id = p.hotbar[i];
    const def = id ? SKILL_BY_ID.get(id) : null;
    const s = document.createElement('div');
    s.className = 'slot' + (def ? '' : ' locked');
    s.dataset.skill = id ?? '';
    s.innerHTML = `<span class="key">${i + 1}</span><span class="ico">${def ? def.icon : '·'}</span><span class="cd hidden"></span>`;
    if (def) s.onclick = () => game.tryUseSkill(id);
    bar.appendChild(s);
  }
  const pot = document.createElement('div');
  pot.className = 'slot';
  pot.innerHTML = `<span class="key">Q</span><span class="ico">🧪</span>`;
  pot.id = 'potion-slot';
  pot.onclick = () => game.tryDrink();
  bar.appendChild(pot);
}

/** @param {any} game */
function updateCooldowns(game) {
  const p = game.player;
  const slots = $('skillbar').children;
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const el = /** @type {HTMLElement|undefined} */ (slots[i]);
    if (!el) continue;
    const id = el.dataset.skill;
    const cd = /** @type {HTMLElement} */ (el.querySelector('.cd'));
    if (!id) { cd.classList.add('hidden'); continue; }
    const t = p.cooldowns[id] ?? 0;
    if (t > 0.05) { cd.classList.remove('hidden'); cd.textContent = t.toFixed(1); }
    else cd.classList.add('hidden');
    const def = SKILL_BY_ID.get(id);
    const usable = t <= 0 && p.stamina >= (def?.stamina ?? 0);
    el.classList.toggle('active', usable);
  }
  const pot = document.getElementById('potion-slot');
  if (pot) pot.classList.toggle('active', p.potions > 0);
  const ico = pot?.querySelector('.ico');
  if (ico) ico.textContent = p.potions > 0 ? `🧪` : '·';
  if (pot) pot.setAttribute('title', `${p.potions} drycker`);
}

/**
 * Etiketter för föremål på marken. Att alltid se vad som ligger där är en av
 * de viktigaste läsbarhetsvinsterna i D2 — man ska aldrig behöva gissa.
 * @param {any} game
 */
export function updateGroundLabels(game) {
  const root = $('ground-labels');
  if (game.groundVersion !== lastGroundVersion) {
    root.innerHTML = '';
    for (const g of game.ground) {
      const el = document.createElement('div');
      el.className = 'glabel ' + (g.kind === 'item' ? 'r-' + g.item.rarity : 'gold');
      el.textContent = g.kind === 'gold' ? `${g.amount} guld`
        : g.kind === 'potion' ? `Hälsodryck ×${g.amount}`
        : g.item.name;
      el.onclick = () => game.tryPickup(g);
      g._el = el;
      root.appendChild(el);
    }
    lastGroundVersion = game.groundVersion;
  }
  // Etiketter som hamnar på varandra förskjuts uppåt — en hög med loot ska
  // gå att läsa post för post, inte bara som ett suddigt kluster.
  /** @type {{x:number,y:number}[]} */
  const placed = [];
  const sorted = game.ground.slice().sort((a, b) => a.y - b.y);
  for (const g of sorted) {
    if (!g._el) continue;
    const sx = (g.x - camera.x) * camera.zoom;
    let sy = (g.y - camera.y - 24) * camera.zoom;
    if (sx < -160 || sy < -60 || sx > innerWidth + 160 || sy > innerHeight + 60) {
      g._el.style.display = 'none';
      continue;
    }
    let guard = 0;
    while (guard++ < 24 && placed.some(q => Math.abs(q.y - sy) < 17 && Math.abs(q.x - sx) < 150)) sy -= 17;
    placed.push({ x: sx, y: sy });
    g._el.style.display = '';
    g._el.style.left = sx + 'px';
    g._el.style.top = sy + 'px';
  }
}

/** @param {string} text */
export function pushAlert(text) {
  const box = $('alerts');
  const d = document.createElement('div');
  d.className = 'alert';
  d.textContent = text;
  box.appendChild(d);
  setTimeout(() => d.remove(), 5000);
  while (box.children.length > 5) box.removeChild(box.children[0]);
}

/**
 * @param {string} title @param {string} body @param {string} btn @param {()=>void} onClick
 */
export function showOverlay(title, body, btn, onClick) {
  $('overlay-title').textContent = title;
  $('overlay-body').innerHTML = body;
  const b = /** @type {HTMLButtonElement} */ ($('overlay-btn'));
  b.textContent = btn;
  b.onclick = () => { hideOverlay(); onClick(); };
  $('overlay').classList.remove('hidden');
}
export function hideOverlay() { $('overlay').classList.add('hidden'); }
export function overlayOpen() { return !$('overlay').classList.contains('hidden'); }


/* ------------------------------------------------------------------ */
/* Navigeringsikoner                                                   */
/* ------------------------------------------------------------------ */

/** @param {any} game */
export function initNav(game) {
  for (const el of /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.navbtn')])) {
    const name = el.dataset.name ?? '';
    const key = el.dataset.key ?? '';
    el.onmouseenter = () => showTextTooltip(
      `<div class="tt-name">${escape(name)}</div><div class="tt-req">Genväg: <b>${escape(key)}</b></div>`);
    el.onmouseleave = hideTooltip;
    el.onclick = () => {
      hideTooltip();
      if (el.dataset.act === 'pause') game.togglePause();
      else if (el.dataset.act === 'help') openHelp(game);
      else togglePanel(game, /** @type {any} */ (el.dataset.panel));
    };
  }
}

/** Speglar vilka paneler som är öppna, och prickar när poäng väntar. @param {any} game */
function updateNav(game) {
  const p = game.player;
  for (const el of /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.navbtn')])) {
    const key = el.dataset.panel;
    if (key) el.classList.toggle('on', !!(/** @type {any} */ (panels)[key]));
    const pending = key === 'character' ? p.statPoints > 0 : key === 'skills' ? p.skillPoints > 0 : false;
    el.classList.toggle('pending', pending);
  }
}

/* ------------------------------------------------------------------ */
/* Pausmeny                                                            */
/* ------------------------------------------------------------------ */

export function pauseMenuOpen() { return !$('pause').classList.contains('hidden'); }
export function hidePauseMenu() { $('pause').classList.add('hidden'); }

/** @param {any} game */
export function showPauseMenu(game) {
  const box = $('pause');
  const note = $('pause-note');
  note.textContent = `${game.player.name} · nivå ${game.player.level} · ${game.zone.name}`;
  const aim = /** @type {HTMLElement} */ (box.querySelector('[data-act="autoaim"]'));
  const atk = /** @type {HTMLElement} */ (box.querySelector('[data-act="autoattack"]'));
  aim.textContent = `Auto-sikte: ${game.settings.autoAim ? 'På' : 'Av'}`;
  atk.textContent = `Auto-attack: ${game.settings.autoAttack ? 'På' : 'Av'}`;

  for (const b of /** @type {HTMLElement[]} */ ([...box.querySelectorAll('button')])) {
    b.onclick = () => {
      switch (b.dataset.act) {
        case 'resume': hidePauseMenu(); game.paused = false; break;
        case 'save': game.save(); b.textContent = 'Sparat ✓'; setTimeout(() => { b.textContent = 'Spara nu'; }, 1400); break;
        case 'autoaim':
          game.settings.autoAim = !game.settings.autoAim;
          aim.textContent = `Auto-sikte: ${game.settings.autoAim ? 'På' : 'Av'}`;
          break;
        case 'autoattack':
          game.settings.autoAttack = !game.settings.autoAttack;
          atk.textContent = `Auto-attack: ${game.settings.autoAttack ? 'På' : 'Av'}`;
          break;
        case 'quit':
          saveGame(game);
          location.reload();
          break;
      }
    };
  }
  box.classList.remove('hidden');
}

/* ------------------------------------------------------------------ */
/* Nivåhöjning                                                         */
/* ------------------------------------------------------------------ */

const ATTRS = /** @type {const} */ (['str', 'dex', 'vit', 'will']);
const ATTR_LABEL = { str: 'Styrka', dex: 'Smidighet', vit: 'Vitalitet', will: 'Vilja' };

/** @param {any} game @param {number} levels */
export function showLevelUp(game, levels) {
  const p = game.player;
  const box = $('levelup');
  $('lvl-badge').textContent = `Nivå ${p.level}`;
  $('lvl-sub').innerHTML = levels > 1
    ? `${levels} nivåer på en gång`
    : 'Du känner dig stadigare på benen.';

  const render = () => {
    const host = $('lvl-stats');
    host.innerHTML = '';
    for (const [n, label] of /** @type {[number,string][]} */ ([
      [p.statPoints, 'attributpoäng att lägga'], [p.skillPoints, 'skillpoäng att lägga'],
    ])) {
      const b = document.createElement('div');
      b.className = 'points' + (n > 0 ? ' has' : '');
      b.innerHTML = `<span class="n">${n}</span><span class="l">${label}</span>`;
      host.appendChild(b);
    }

    for (const key of ATTRS) {
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<span>${ATTR_LABEL[key]}</span><span>${p.eff[key]}</span>`;
      if (p.statPoints > 0) {
        const b = document.createElement('span');
        b.className = 'plus'; b.textContent = '+';
        b.onclick = () => { p.statPoints--; p.stats[key]++; recalc(p); game.dirtyUI = true; render(); };
        /** @type {HTMLElement} */ (r.children[0]).appendChild(b);
      }
      r.onmouseenter = () => showTextTooltip(attrTooltip(p, key));
      r.onmouseleave = hideTooltip;
      host.appendChild(r);
    }
  };
  render();

  for (const b of /** @type {HTMLElement[]} */ ([...box.querySelectorAll('button')])) {
    b.onclick = () => {
      if (b.dataset.act === 'skills') { panels.skills = true; game.dirtyUI = true; return; }
      hideLevelUp();
      closeAllPanels(game);
      game.paused = false;
    };
  }
  box.classList.remove('hidden');
}

export function hideLevelUp() { $('levelup').classList.add('hidden'); }
export function levelUpOpen() { return !$('levelup').classList.contains('hidden'); }

/* ------------------------------------------------------------------ */
/* Tutorial                                                            */
/* ------------------------------------------------------------------ */

const TUTORIAL = [
  { ico: '🧭', title: 'Följ stigen norrut',
    body: 'Gå med <b>piltangenterna</b>. Stigen genom varje karta leder till nästa område — och en sidostig leder till något värt att hitta.' },
  { ico: '🪓', title: 'Du slåss av dig själv',
    body: 'Kommer en fiende inom räckhåll <b>attackerar du automatiskt</b> och siktar på den närmaste. Du behöver inte klicka.<br><b>Mellanslag</b> rullar undan — du är osårbar mitt i rullningen.' },
  { ico: '💨', title: 'Uthålligheten är din klocka',
    body: 'Varje svep kostar uthållighet, och <b>i strid återhämtar du dig bara långsamt</b>. Tar den slut kan du inte slå.<br>Varje fälld fiende ger en klunk tillbaka — så belönas den som träffar, inte den som slår i luften.' },
  { ico: '🧪', title: 'Håll dig vid liv',
    body: '<b>Q</b> dricker en hälsodryck. Skills ligger på <b>1–6</b>.<br>Loot plockas upp automatiskt när du går över det — men det droppar sällan, så det som faller är värt att titta på.' },
  { ico: '🗿', title: 'Hitta hem',
    body: 'Rör vid <b>vägstenen</b> i varje område — då kan du resa dit igen.<br><b>T</b> öppnar en portal till byn och tillbaka till samma plats.<br><br>Tryck på <b>?</b> uppe till höger för att läsa det här igen.' },
];

/**
 * Öppnar genomgången på nytt från frågetecknet. Pausar spelet så länge, och
 * lämnar tillbaka kontrollen där man var.
 * @param {any} game
 */
export function openHelp(game) {
  hideTooltip();
  const wasPaused = game.paused;
  game.paused = true;
  showTutorial(() => { game.paused = wasPaused; });
}

/** @param {()=>void} onDone */
export function showTutorial(onDone) {
  let i = 0;
  const box = $('tutorial');
  const next = /** @type {HTMLButtonElement} */ ($('tut-next'));
  const draw = () => {
    const s = TUTORIAL[i];
    $('tut-step').textContent = `${i + 1} / ${TUTORIAL.length}`;
    $('tut-ico').textContent = s.ico;
    $('tut-title').textContent = s.title;
    $('tut-body').innerHTML = s.body;
    next.textContent = i === TUTORIAL.length - 1 ? 'Ut i kylan' : 'Nästa';
  };
  next.onclick = () => {
    i++;
    if (i >= TUTORIAL.length) { box.classList.add('hidden'); onDone(); return; }
    draw();
  };
  draw();
  box.classList.remove('hidden');
}
