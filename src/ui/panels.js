// @ts-check
import { EQUIP_SLOTS, SLOT_LABEL, BAG_COLS, BAG_ROWS, HOTBAR_SIZE } from '../entities/player.js';
import { RARITY_COLOR } from '../data/items.js';
import { recalc, RES_CAP } from '../systems/stats.js';
import { attributeCards, skillTreeEl, confirmBar, pointsBadge, statPointsLeft, skillPointsLeft }
  from './alloc-ui.js';
import { equip, unequip, dropItem, sellItem, packBag, bagUsage } from '../systems/inventory.js';
import { itemValue } from '../systems/loot.js';
import { showItemTooltip, showTextTooltip, hideTooltip, escape } from './tooltip.js';

/** @typedef {import('../systems/loot.js').Item} Item */

export const panels = {
  inventory: false, character: false, skills: false, vendor: false, waypoint: false,
  /** @type {'stal'|'frost'|'uthallighet'} */
  skillTab: 'stal',
};

export function anyPanelOpen() {
  return panels.inventory || panels.character || panels.skills || panels.vendor || panels.waypoint;
}

/** @param {any} game @param {keyof typeof panels} name */
export function togglePanel(game, name) {
  const was = panels[name];
  if (name === 'vendor' && !was) panels.inventory = true;
  panels[name] = !was;
  if (name === 'inventory' && was) panels.vendor = false;
  hideTooltip();
  game.dirtyUI = true;
}

/** @param {any} game */
export function closeAllPanels(game) {
  panels.inventory = panels.character = panels.skills = panels.vendor = panels.waypoint = false;
  hideTooltip();
  game.dirtyUI = true;
}

const rarityClass = { normal: 'rn', magic: 'rm', rare: 'rr', unique: 'ru' };

/** @param {any} game */
export function renderPanels(game) {
  const root = /** @type {HTMLElement} */ (document.getElementById('panels'));
  root.innerHTML = '';
  if (panels.character) root.appendChild(characterPanel(game));
  if (panels.skills) root.appendChild(skillsPanel(game));
  if (panels.vendor) root.appendChild(vendorPanel(game));
  if (panels.waypoint) root.appendChild(waypointPanel(game));
  if (panels.inventory) root.appendChild(inventoryPanel(game));
  stackPanels(root);
}

/**
 * Flera paneler på samma sida får inte lägga sig ovanpå varandra.
 * @param {HTMLElement} root
 */
function stackPanels(root) {
  const gap = 12;
  for (const side of /** @type {const} */ (['left', 'right'])) {
    const list = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.panel.' + side)]);
    let offset = 22;
    for (const el of list) {
      const w = el.getBoundingClientRect().width || (el.classList.contains('wide') ? 392 : 330);
      // Två paneler får ligga sida vid sida så länge de inte äter upp mer än
      // 62% av bredden — resten behövs för panelen på andra sidan.
      if (offset + w > innerWidth * 0.62 && list.length > 1) {
        el.style[side] = (22 + list.indexOf(el) * 18) + 'px';
        el.style.top = (64 + list.indexOf(el) * 18) + 'px';
        continue;
      }
      el.style[side] = offset + 'px';
      offset += w + gap;
    }
  }
}

/** @param {string} title @param {'left'|'right'} side @param {()=>void} onClose @param {boolean} [wide] */
function shell(title, side, onClose, wide) {
  const d = document.createElement('div');
  d.className = `panel ${side}${wide ? ' wide' : ''}`;
  d.innerHTML = `<h2>${title}</h2><div class="close">✕</div>`;
  /** @type {HTMLElement} */ (d.querySelector('.close')).onclick = onClose;
  return d;
}

/** @param {any} game */
function inventoryPanel(game) {
  const p = game.player;
  const d = shell('Utrustning &amp; väska', 'right',
    () => { panels.inventory = false; panels.vendor = false; game.dirtyUI = true; }, true);

  const doll = document.createElement('div');
  doll.id = 'equip-doll';
  for (const slot of EQUIP_SLOTS) {
    const item = /** @type {Item|null} */ (p.equipment[slot]);
    const c = document.createElement('div');
    c.className = 'eq' + (item ? ' filled' : '');
    c.dataset.slot = slot;
    c.innerHTML = item
      ? `<div class="ic">${item.base.icon}</div><div class="nm" style="color:${RARITY_COLOR[item.rarity]}">${escape(shorten(item.name))}</div>`
      : SLOT_LABEL[slot];
    if (item) {
      c.onmouseenter = () => showItemTooltip(item, p, null, 'Klicka för att ta av');
      c.onmouseleave = hideTooltip;
      c.onclick = () => { unequip(game, slot); hideTooltip(); };
    }
    doll.appendChild(c);
  }
  d.appendChild(doll);

  const info = document.createElement('div');
  info.className = 'row';
  info.innerHTML = `<span>Drycker</span><span>🧪 ${p.potions}</span>`;
  d.appendChild(info);

  const usage = bagUsage(p.inventory);
  const head = document.createElement('div');
  head.className = 'grp';
  head.textContent = `Väska ${usage.used}/${usage.total} rutor` +
    (panels.vendor ? ' — klicka för att sälja' : '');
  d.appendChild(head);

  // Rutnätet ritas i två lager: tomma rutor underst, föremålen ovanpå med
  // explicit grid-area. Då kan ett svärd spänna över flera rutor utan att
  // knuffa runt bakgrunden.
  const bag = document.createElement('div');
  bag.id = 'bag';
  const backdrop = document.createElement('div');
  backdrop.className = 'bag-grid backdrop';
  for (let i = 0; i < BAG_COLS * BAG_ROWS; i++) backdrop.appendChild(document.createElement('div'));
  bag.appendChild(backdrop);

  const layer = document.createElement('div');
  layer.className = 'bag-grid items';
  for (const slotted of packBag(p.inventory).placed) {
    const item = slotted.item;
    const c = document.createElement('div');
    c.className = 'bag-item ' + rarityClass[item.rarity];
    c.style.gridColumn = `${slotted.x + 1} / span ${slotted.w}`;
    c.style.gridRow = `${slotted.y + 1} / span ${slotted.h}`;
    c.innerHTML = `<span class="bi-ico">${item.base.icon}</span>`;
    const eqSlot = item.base.slot === 'ring' ? (p.equipment.ring1 ? 'ring2' : 'ring1') : item.base.slot;
    const cur = /** @type {Item|null} */ (p.equipment[eqSlot] ?? null);
    c.onmouseenter = () => showItemTooltip(item, p, cur,
      panels.vendor ? `Klicka: sälj för ${itemValue(item)} guld` : 'Klicka: utrusta · Högerklick: släng');
    c.onmouseleave = hideTooltip;
    c.onclick = () => { panels.vendor ? sellItem(game, item) : equip(game, item); hideTooltip(); };
    c.oncontextmenu = (e) => { e.preventDefault(); if (!panels.vendor) dropItem(game, item); hideTooltip(); };
    layer.appendChild(c);
  }
  bag.appendChild(layer);
  d.appendChild(bag);
  return d;
}

/** @param {string} s */
function shorten(s) { return s.length > 20 ? s.slice(0, 18) + '…' : s; }

/* ------------------------------------------------------------------ */
/* Karaktär                                                            */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function characterPanel(game) {
  const p = game.player;
  const d = shell(escape(p.name || 'Barbaren'), 'left', () => { panels.character = false; game.dirtyUI = true; });

  /** @param {string} label @param {string} value @param {string} [tip] */
  const row = (label, value, tip) => {
    const r = document.createElement('div');
    r.className = 'row';
    r.innerHTML = `<span>${label}</span><span>${value}</span>`;
    if (tip) { r.onmouseenter = () => showTextTooltip(tip); r.onmouseleave = hideTooltip; }
    return r;
  };
  const g = (/** @type {string} */ t) => {
    const e = document.createElement('div'); e.className = 'grp'; e.textContent = t; return e;
  };

  d.appendChild(row('Klass', 'Barbar'));
  d.appendChild(row('Nivå', String(p.level)));
  d.appendChild(row('Erfarenhet', `${p.xp} / ${p.xpNext}`));
  d.appendChild(row('Fällda fiender', String(p.kills)));
  d.appendChild(row('Dödsfall', String(p.deaths)));

  d.appendChild(g('Attribut'));
  d.appendChild(pointsBadge(statPointsLeft(p, game.pending), 'attributpoäng att lägga', '✦'));
  d.appendChild(attributeCards(game, () => { game.dirtyUI = true; }));
  const cbar = confirmBar(game, 'stats', () => { game.dirtyUI = true; });
  if (cbar) d.appendChild(cbar);

  d.appendChild(g('Strid'));
  d.appendChild(row('Skada', `${p.dmgMin}–${p.dmgMax}`));
  d.appendChild(row('Attackhastighet', `${p.attackSpeed.toFixed(2)}×`));
  d.appendChild(row('Kritisk träff', `${p.critChance.toFixed(1)}% (×${(p.critMult / 100).toFixed(2)})`));
  if (p.coldDmg) d.appendChild(row('Köldskada', `+${Math.round(p.coldDmg)}`));
  if (p.fireDmg) d.appendChild(row('Eldskada', `+${p.fireDmg}`));
  if (p.lightDmg) d.appendChild(row('Blixtskada', `+${p.lightDmg}`));
  if (p.freezeChance) d.appendChild(row('Chans att frysa', `${p.freezeChance}%`));
  if (p.lifeSteal) d.appendChild(row('Livsdräneri', `${(p.lifeSteal * 100).toFixed(1)}%`));

  d.appendChild(g('Försvar'));
  d.appendChild(row('Rustning', String(p.armor),
    '<b>Rustning</b><br>Minskar fysisk skada. Effekten avtar mot högre monsternivåer — ' +
    'du behöver mer rustning för samma skydd längre in i vildmarken.'));
  if (p.dmgReduction) d.appendChild(row('Skadereduktion', `${(p.dmgReduction * 100).toFixed(1)}%`));
  d.appendChild(row('Max liv', String(p.maxHp)));
  d.appendChild(row('Livsåterhämtning', `${p.lifeRegen.toFixed(1)}/s`));
  const cap = p.resCap ?? RES_CAP;
  d.appendChild(row('Köldmotstånd', `${p.res.cold}% / ${cap}%`));
  d.appendChild(row('Eldmotstånd', `${p.res.fire}% / ${cap}%`));
  d.appendChild(row('Blixtmotstånd', `${p.res.light}% / ${cap}%`));

  d.appendChild(g('Uthållighet'));
  d.appendChild(row('Max uthållighet', String(p.maxStamina),
    '<div class="tt-name">Uthållighet</div><div class="tt-core">Varje svep och varje skill kostar. ' +
    'Under strid återhämtar du dig bara till 40% — bryt kontakten för full takt.</div>' +
    '<div class="tt-req">Varje fälld fiende ger 8 tillbaka.</div>'));
  d.appendChild(row('Kostnad per svep', (p.attackCost ?? 8).toFixed(1)));
  d.appendChild(row('Återhämtning', `${p.staminaRegen.toFixed(1)}/s · ${(p.staminaRegen * 0.4).toFixed(1)}/s i strid`));

  d.appendChild(g('Mana'));
  d.appendChild(row('Max mana', String(p.maxMana),
    '<div class="tt-name">Mana</div><div class="tt-core">Bara Frost-skills drar mana. ' +
    'Den återhämtar sig i jämn takt och bryr sig inte om huruvida du slåss.</div>' +
    '<div class="tt-req">Intelligens är det enda attributet som höjer den.</div>'));
  d.appendChild(row('Återhämtning', `${p.manaRegen.toFixed(1)}/s`));

  d.appendChild(g('Övrigt'));
  d.appendChild(row('Gånghastighet', `${Math.round(p.moveSpeed)}`));
  d.appendChild(row('Bättre fynd', `+${p.magicFind}%`));
  return d;
}

/* ------------------------------------------------------------------ */
/* Skill-träd                                                          */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function skillsPanel(game) {
  const p = game.player;
  const d = shell('Skills', 'left', () => { game.dropPending(); panels.skills = false; game.dirtyUI = true; });
  const redraw = () => { game.dirtyUI = true; };
  d.appendChild(pointsBadge(skillPointsLeft(p, game.pending), 'skillpoäng att lägga', '🌟'));
  d.appendChild(skillTreeEl(game, redraw));
  const bar = confirmBar(game, 'skills', redraw);
  if (bar) d.appendChild(bar);
  return d;
}

/* ------------------------------------------------------------------ */
/* Vägstenar (waypoints)                                               */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function waypointPanel(game) {
  const d = shell('Vägstenar', 'left', () => { panels.waypoint = false; game.dirtyUI = true; });

  const intro = document.createElement('div');
  intro.className = 'tt-base';
  intro.style.marginBottom = '10px';
  intro.textContent = 'Res till en plats du redan hittat.';
  d.appendChild(intro);

  for (const z of game.waypointList()) {
    const row = document.createElement('div');
    row.className = 'node' + (z.known ? '' : ' locked');
    row.innerHTML = `<div class="ico">${z.index === 0 ? '🔥' : '🗿'}</div>` +
      `<div class="t"><b>${escape(z.name)}</b><i>${z.known ? (z.index === 0 ? 'Byn' : `Monsternivå ${z.level}`) : 'Inte upptäckt'}</i></div>` +
      `<div class="rk">${z.here ? 'här' : z.known ? '→' : '🔒'}</div>`;
    row.style.marginBottom = '6px';
    if (z.known && !z.here) row.onclick = () => { game.travelToWaypoint(z.index); closeAllPanels(game); };
    d.appendChild(row);
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Handlare                                                            */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function vendorPanel(game) {
  const p = game.player;
  const d = shell('Gerd Askhand', 'left', () => { panels.vendor = false; game.dirtyUI = true; });

  const intro = document.createElement('div');
  intro.className = 'tt-base';
  intro.style.marginBottom = '10px';
  intro.textContent = 'Klicka på något i väskan för att sälja det.';
  d.appendChild(intro);

  const potionPrice = 35 + p.level * 6;
  /** @param {string} icon @param {string} title @param {string} sub @param {number} price @param {()=>void} act */
  const offer = (icon, title, sub, price, act) => {
    const b = document.createElement('div');
    b.className = 'node';
    b.style.marginBottom = '6px';
    b.innerHTML = `<div class="ico">${icon}</div><div class="t"><b>${title}</b><i>${sub}</i></div><div class="rk">${price}g</div>`;
    b.onclick = () => {
      if (p.gold < price) { game.alert('För lite guld.'); return; }
      p.gold -= price; act(); game.dirtyUI = true; game.autosave?.();
    };
    d.appendChild(b);
  };
  offer('🧪', 'Hälsodryck', 'Återställer 45% av ditt liv', potionPrice, () => p.potions++);
  offer('🧪', 'Fem hälsodrycker', 'Fyll bältet inför vildmarken', potionPrice * 5, () => { p.potions += 5; });

  const junk = p.inventory.filter((/** @type {Item} */ i) => i.rarity === 'normal');
  const junkGold = junk.reduce((/** @type {number} */ a, /** @type {Item} */ i) => a + itemValue(i), 0);
  const sellAll = document.createElement('div');
  sellAll.className = 'node';
  sellAll.innerHTML = `<div class="ico">🪙</div><div class="t"><b>Sälj allt vanligt</b><i>${junk.length} föremål</i></div><div class="rk">+${junkGold}g</div>`;
  sellAll.onclick = () => { for (const i of junk.slice()) sellItem(game, i); game.autosave?.(); };
  d.appendChild(sellAll);

  const gold = document.createElement('div');
  gold.className = 'row';
  gold.style.marginTop = '12px';
  gold.innerHTML = `<span>Ditt guld</span><span style="color:#d8b26a">${p.gold}</span>`;
  d.appendChild(gold);
  return d;
}

export { HOTBAR_SIZE };
