// @ts-check
import { camera, PROJ } from '../render/camera.js';
import { SKILL_BY_ID } from '../data/skills.js';
import { HOTBAR_SIZE } from '../entities/player.js';
import { showTextTooltip, hideTooltip, escape } from './tooltip.js';
import { panels, togglePanel, closeAllPanels } from './panels.js';
import { attributeCards, skillTreeEl, confirmBar, pointsBadge, statPointsLeft, skillPointsLeft,
  pendingStats, pendingSkills } from './alloc-ui.js';
import { commitPending } from '../systems/allocation.js';

import { saveGame } from '../systems/save.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Restarts a flash only when it is actually new — otherwise it would
 * animationen aldrig hinna spela klart mellan bildrutorna.
 * @param {string} id @param {number|undefined} flash
 */
function flashOnce(id, flash) {
  const el = $(id);
  if ((flash ?? 0) > 0.4 && !el.classList.contains('flash')) {
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 460);
  }
}

let lastGroundVersion = -1;
let lastHotbar = '';

/** @param {any} game */
export function updateHud(game) {
  const p = game.player;

  $('hp-fill').style.height = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  $('hp-text').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
  $('mana-fill').style.height = `${Math.max(0, (p.mana / p.maxMana) * 100)}%`;
  $('mana-text').textContent = `${Math.ceil(p.mana)}/${p.maxMana}`;
  $('stamina-fill').style.width = `${Math.max(0, (p.stamina / p.maxStamina) * 100)}%`;
  $('sta-text').textContent = `${Math.ceil(p.stamina)}/${p.maxStamina}`;
  $('stamina-bar').classList.toggle('low', !!p.exhausted);
  flashOnce('stamina-bar', p.staminaFlash);
  flashOnce('mana-orb', p.manaFlash);
  $('xp-fill').style.width = `${(p.xp / p.xpNext) * 100}%`;
  $('zone-name').textContent = game.zone.name;
  $('zone-lvl').textContent = game.zone.isTown ? 'sanctuary' : `monster level ${game.zone.level}`;
  $('veil').style.opacity = String(game.veil ?? 0);
  $('char-level').textContent = `Level ${p.level}`;
  $('gold').textContent = String(p.gold);

  updateNav(game);

  const sig = p.hotbar.join(',');
  if (sig !== lastHotbar) { rebuildSkillbar(game); lastHotbar = sig; }
  updateCooldowns(game);
  updateGroundLabels(game);
}

/**
 * The place name that fades in high on the screen when you arrive somewhere.
 * The animation has to restart from zero every time — hence removing the class
 * and forcing a reflow before setting it back.
 * @param {string} name @param {string} sub
 */
export function showZoneBanner(name, sub) {
  const el = $('banner');
  $('banner-name').textContent = name;
  $('banner-sub').textContent = sub;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
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
    const usable = t <= 0
      && p.stamina >= (def?.stamina ?? 0)
      && p.mana >= (def?.mana ?? 0);
    el.classList.toggle('active', usable);
  }
  const pot = document.getElementById('potion-slot');
  if (pot) pot.classList.toggle('active', p.potions > 0);
  const ico = pot?.querySelector('.ico');
  if (ico) ico.textContent = p.potions > 0 ? `🧪` : '·';
  if (pot) pot.setAttribute('title', `${p.potions} drycker`);
}

/**
 * Labels for items on the ground. Always seeing what lies there is one of D2's
 * biggest readability wins — you should never have to guess.
 * @param {any} game
 */
export function updateGroundLabels(game) {
  const root = $('ground-labels');
  if (game.groundVersion !== lastGroundVersion) {
    root.innerHTML = '';
    for (const g of game.ground) {
      const el = document.createElement('div');
      el.className = 'glabel ' + (g.kind === 'item' ? 'r-' + g.item.rarity : 'gold');
      el.textContent = g.kind === 'gold' ? `${g.amount} gold`
        : g.kind === 'potion' ? `Health potion ×${g.amount}`
        : g.item.name;
      el.onclick = () => game.tryPickup(g);
      g._el = el;
      root.appendChild(el);
    }
    lastGroundVersion = game.groundVersion;
  }
  // Labels that land on top of each other are pushed upward — a pile of loot
  // should be readable item by item, not just as a blurry cluster.
  /** @type {{x:number,y:number}[]} */
  const placed = [];
  const sorted = game.ground.slice().sort((a, b) => a.y - b.y);
  for (const g of sorted) {
    if (!g._el) continue;
    const sx = (g.x - camera.x) * camera.zoom;
    let sy = ((g.y - camera.y) * PROJ - 24) * camera.zoom;
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
      `<div class="tt-name">${escape(name)}</div><div class="tt-req">Shortcut: <b>${escape(key)}</b></div>`);
    el.onmouseleave = hideTooltip;
    el.onclick = () => {
      hideTooltip();
      if (el.dataset.act === 'pause') game.togglePause();
      else if (el.dataset.act === 'help') openHelp(game);
      else togglePanel(game, /** @type {any} */ (el.dataset.panel));
    };
  }
}

/** Mirrors which panels are open, and dots when points are waiting. @param {any} game */
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
  note.textContent = `${game.player.name} · level ${game.player.level} · ${game.zone.name}`;
  const aim = /** @type {HTMLElement} */ (box.querySelector('[data-act="autoaim"]'));
  const atk = /** @type {HTMLElement} */ (box.querySelector('[data-act="autoattack"]'));
  aim.textContent = `Auto-aim: ${game.settings.autoAim ? 'On' : 'Off'}`;
  atk.textContent = `Auto-attack: ${game.settings.autoAttack ? 'On' : 'Off'}`;

  for (const b of /** @type {HTMLElement[]} */ ([...box.querySelectorAll('button')])) {
    b.onclick = () => {
      switch (b.dataset.act) {
        case 'resume': hidePauseMenu(); game.paused = false; break;
        case 'save': game.save(); b.textContent = 'Saved ✓'; setTimeout(() => { b.textContent = 'Save now'; }, 1400); break;
        case 'autoaim':
          game.settings.autoAim = !game.settings.autoAim;
          aim.textContent = `Auto-aim: ${game.settings.autoAim ? 'On' : 'Off'}`;
          break;
        case 'autoattack':
          game.settings.autoAttack = !game.settings.autoAttack;
          atk.textContent = `Auto-attack: ${game.settings.autoAttack ? 'On' : 'Off'}`;
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
/* Level-up                                                            */
/* ------------------------------------------------------------------ */

/**
 * The level-up window. Wide enough to hold both the attribute cards and the
 * *whole* skill tree, so nothing hides behind a button. Points go into a pending
 * pile that can be taken back — only "Confirm" writes them to the character.
 * @param {any} game @param {number} levels
 */
export function showLevelUp(game, levels) {
  const p = game.player;
  const box = $('levelup');
  $('lvl-badge').textContent = `Level ${p.level}`;
  $('lvl-sub').innerHTML = levels > 1
    ? `${levels} levels at once`
    : 'You feel steadier on your feet.';

  const render = () => {
    const host = $('lvl-stats');
    host.innerHTML = '';

    // Each column has its own undo/confirm row. Attributes and skills are
    // separate decisions and are confirmed separately.
    const left = document.createElement('div');
    left.className = 'lvl-col';
    left.appendChild(pointsBadge(statPointsLeft(p, game.pending), 'attribute points', '✦'));
    left.appendChild(attributeCards(game, render));
    const lbar = confirmBar(game, 'stats', render);
    if (lbar) left.appendChild(lbar);

    const right = document.createElement('div');
    right.className = 'lvl-col';
    right.appendChild(pointsBadge(skillPointsLeft(p, game.pending), 'skill points', '🌟'));
    right.appendChild(skillTreeEl(game, render));
    const rbar = confirmBar(game, 'skills', render);
    if (rbar) right.appendChild(rbar);

    host.appendChild(left);
    host.appendChild(right);

    // The big button confirms everything pending and closes. Throwing away a
    // finished allocation instead would be a nasty surprise — the columns' own
    // rows are still there for anyone who wants to confirm one at a time.
    const actions = $('lvl-actions');
    actions.innerHTML = '';
    const waiting = pendingStats(game.pending) + pendingSkills(game.pending);
    const done = document.createElement('button');
    done.className = 'primary';
    done.textContent = waiting ? `Confirm ${waiting} and continue` : 'Continue';
    done.onclick = () => {
      commitPending(game, game.pending);
      hideLevelUp();
      closeAllPanels(game);
      game.paused = false;
    };
    actions.appendChild(done);
  };
  render();
  box.classList.remove('hidden');
}

export function hideLevelUp() { $('levelup').classList.add('hidden'); }
export function levelUpOpen() { return !$('levelup').classList.contains('hidden'); }

/* ------------------------------------------------------------------ */
/* Tutorial                                                            */
/* ------------------------------------------------------------------ */

const TUTORIAL = [
  { ico: '🧭', title: 'Follow the path north',
    body: 'Walk with the <b>arrow keys</b>. The path through every map leads out of the picture to the north — <b>just keep going where it ends</b> and you are in the next area. A side path leads to something worth finding.' },
  { ico: '🪓', title: 'You fight on your own',
    body: 'When an enemy comes within reach <b>you attack automatically</b>, aiming at the nearest one. You never have to click.<br><b>Space</b> rolls aside — you are invulnerable in the middle of the roll.' },
  { ico: '💨', title: 'Stamina is your clock',
    body: 'Every swing costs stamina, and <b>in combat you recover only slowly</b>. Run out and you cannot strike.<br>Every enemy felled gives a gulp back — so the one who lands blows is rewarded, not the one swinging at air.' },
  { ico: '🧪', title: 'Stay alive',
    body: '<b>Q</b> drinks a health potion. Skills sit on <b>1–6</b>.<br>Loot is picked up automatically as you walk over it — but it drops rarely, so what falls is worth a look.' },
  { ico: '🗿', title: 'Find your way home',
    body: 'Touch the <b>waystone</b> in every area — then you can travel back there.<br><b>T</b> opens a portal to the village and back to the same spot.<br><br>Press <b>?</b> in the top right to read this again.' },
];

/**
 * Reopens the walkthrough from the question mark. Pauses the game meanwhile,
 * and hands control back where it was.
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
    next.textContent = i === TUTORIAL.length - 1 ? 'Out into the cold' : 'Next';
  };
  next.onclick = () => {
    i++;
    if (i >= TUTORIAL.length) { box.classList.add('hidden'); onDone(); return; }
    draw();
  };
  draw();
  box.classList.remove('hidden');
}
