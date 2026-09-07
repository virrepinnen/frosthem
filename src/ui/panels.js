// @ts-check
import { EQUIP_SLOTS, SLOT_LABEL, BAG_COLS, BAG_ROWS, HOTBAR_SIZE } from '../entities/player.js';
import { RARITY_COLOR } from '../data/items.js';
import { recalc, RES_CAP } from '../systems/stats.js';
import { skillTreeEl } from './skill-ui.js';
import { heldBoons } from '../systems/boons.js';
import { ROMAN } from '../data/boons.js';
import { glyph, KIND_GLYPH } from './glyphs.js';
import { equip, unequip, dropItem, sellItem, packBag, bagUsage } from '../systems/inventory.js';
import { itemValue } from '../systems/loot.js';
import { showItemTooltip, showTextTooltip, hideTooltip, escape } from './tooltip.js';

/** @typedef {import('../systems/loot.js').Item} Item */

export const panels = {
  inventory: false, character: false, skills: false, vendor: false, waypoint: false,
  /** @type {'steel'|'frost'|'endurance'} */
  skillTab: 'steel',
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
 * Several panels on the same side must not stack on top of each other.
 * @param {HTMLElement} root
 */
function stackPanels(root) {
  const gap = 12;
  for (const side of /** @type {const} */ (['left', 'right'])) {
    const list = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.panel.' + side)]);
    let offset = 22;
    for (const el of list) {
      // The full-height sheet is anchored to the edge and never stacked.
      if (el.classList.contains('sheet')) continue;
      const w = el.getBoundingClientRect().width || (el.classList.contains('wide') ? 392 : 330);
      // Two panels may sit side by side as long as they do not eat more than
      // 62% of the width — the rest is needed for the panel on the other side.
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
  // The bag takes the full height and half the width. It is the panel you spend
  // the most time reading, and squinting at 30-pixel cells in a corner was the
  // worst of both worlds — too small to read, too big to ignore.
  const d = shell('Equipment &amp; bag', 'right',
    () => { panels.inventory = false; panels.vendor = false; game.dirtyUI = true; }, true);
  d.classList.add('sheet');

  const doll = document.createElement('div');
  doll.id = 'equip-doll';
  for (const slot of EQUIP_SLOTS) {
    const item = /** @type {Item|null} */ (p.equipment[slot]);
    const c = document.createElement('div');
    c.className = 'eq' + (item ? ' filled' : '');
    c.dataset.slot = slot;
    c.innerHTML = item
      ? `<div class="ic">${glyph(KIND_GLYPH[item.base.kind] ?? 'ring')}</div><div class="nm" style="color:${RARITY_COLOR[item.rarity]}">${escape(shorten(item.name))}</div>`
      : SLOT_LABEL[slot];
    if (item) {
      c.onmouseenter = () => showItemTooltip(item, p, null, 'Click to take off');
      c.onmouseleave = hideTooltip;
      c.onclick = () => { unequip(game, slot); hideTooltip(); };
    }
    doll.appendChild(c);
  }
  d.appendChild(doll);

  const info = document.createElement('div');
  info.className = 'row';
  info.innerHTML = `<span>Potions</span><span class="pot-count">${glyph('potion')} ${p.potions}</span>`;
  d.appendChild(info);

  const usage = bagUsage(p.inventory);
  const head = document.createElement('div');
  head.className = 'grp';
  head.textContent = `Bag ${usage.used}/${usage.total} cells` +
    (panels.vendor ? ' — click to sell' : '');
  d.appendChild(head);

  // The grid is drawn in two layers: empty cells underneath, items on top with
  // an explicit grid-area. That lets a sword span several cells without pushing
  // the backdrop around.
  //
  // The track counts come from BAG_COLS/BAG_ROWS rather than from the
  // stylesheet. They were hard-coded there once, and when the bag grew from ten
  // columns to twelve the two quietly disagreed — items landed in implicit
  // tracks and the backdrop grew rows nobody asked for.
  const bag = document.createElement('div');
  bag.id = 'bag';
  bag.style.aspectRatio = `${BAG_COLS} / ${BAG_ROWS}`;
  const tracks = (/** @type {HTMLElement} */ el) => {
    el.style.gridTemplateColumns = `repeat(${BAG_COLS}, 1fr)`;
    el.style.gridTemplateRows = `repeat(${BAG_ROWS}, 1fr)`;
  };
  const backdrop = document.createElement('div');
  backdrop.className = 'bag-grid backdrop';
  tracks(backdrop);
  for (let i = 0; i < BAG_COLS * BAG_ROWS; i++) backdrop.appendChild(document.createElement('div'));
  bag.appendChild(backdrop);

  const layer = document.createElement('div');
  layer.className = 'bag-grid items';
  tracks(layer);
  for (const slotted of packBag(p.inventory).placed) {
    const item = slotted.item;
    const c = document.createElement('div');
    c.className = 'bag-item ' + rarityClass[item.rarity];
    c.style.gridColumn = `${slotted.x + 1} / span ${slotted.w}`;
    c.style.gridRow = `${slotted.y + 1} / span ${slotted.h}`;
    c.innerHTML = `<span class="bi-ico">${glyph(KIND_GLYPH[item.base.kind] ?? 'ring')}</span>`;
    const eqSlot = item.base.slot === 'ring' ? (p.equipment.ring1 ? 'ring2' : 'ring1') : item.base.slot;
    const cur = /** @type {Item|null} */ (p.equipment[eqSlot] ?? null);
    c.onmouseenter = () => showItemTooltip(item, p, cur,
      panels.vendor ? `Click: sell for ${itemValue(item)} gold` : 'Click: equip · Right click: drop');
    c.onmouseleave = hideTooltip;
    c.onclick = () => { panels.vendor ? sellItem(game, item) : equip(game, item); hideTooltip(); };
    c.oncontextmenu = (e) => { e.preventDefault(); if (!panels.vendor) dropItem(game, item); hideTooltip(); };
    layer.appendChild(c);
  }
  bag.appendChild(layer);
  const wrap = document.createElement('div');
  wrap.className = 'bag-wrap';
  wrap.appendChild(bag);
  d.appendChild(wrap);
  return d;
}

/** @param {string} s */
function shorten(s) { return s.length > 20 ? s.slice(0, 18) + '…' : s; }

/* ------------------------------------------------------------------ */
/* Character                                                           */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function characterPanel(game) {
  const p = game.player;
  const d = shell(escape(p.name || 'Barbarian'), 'left', () => { panels.character = false; game.dirtyUI = true; });

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

  d.appendChild(row('Class', 'Barbarian'));
  d.appendChild(row('Level', String(p.level)));
  d.appendChild(row('Experience', `${p.xp} / ${p.xpNext}`));
  d.appendChild(row('Enemies felled', String(p.kills)));
  d.appendChild(row('Deaths', String(p.deaths)));

  // Blessings replaced the attribute block. They are the record of the choices
  // made on level-up, so this is where you read back what the character became.
  const boons = heldBoons(p);
  d.appendChild(g('Blessings'));
  if (!boons.length) {
    const none = document.createElement('div');
    none.className = 'tt-req';
    none.textContent = 'None yet — the first arrives with your next level.';
    d.appendChild(none);
  } else {
    const list = document.createElement('div');
    list.className = 'boon-list';
    for (const { def, rank } of boons) {
      const it = document.createElement('div');
      it.className = 'boon-held ' + def.group;
      it.innerHTML = `<div class="bh-ico">${glyph(def.icon, 1.4)}</div>` +
        `<div class="bh-t"><b>${escape(def.name)}</b><i>${escape(def.line(rank))}</i></div>` +
        `<div class="bh-rk">${ROMAN[rank] ?? rank}</div>`;
      list.appendChild(it);
    }
    d.appendChild(list);
  }

  d.appendChild(g('Combat'));
  d.appendChild(row('Damage', `${p.dmgMin}–${p.dmgMax}`));
  d.appendChild(row('Attack speed', `${p.attackSpeed.toFixed(2)}×`));
  d.appendChild(row('Critical hit', `${p.critChance.toFixed(1)}% (×${(p.critMult / 100).toFixed(2)})`));
  if (p.coldDmg) d.appendChild(row('Cold damage', `+${Math.round(p.coldDmg)}`));
  if (p.fireDmg) d.appendChild(row('Fire damage', `+${p.fireDmg}`));
  if (p.lightDmg) d.appendChild(row('Lightning damage', `+${p.lightDmg}`));
  if (p.freezeChance) d.appendChild(row('Chance to freeze', `${p.freezeChance}%`));
  if (p.lifeSteal) d.appendChild(row('Life steal', `${(p.lifeSteal * 100).toFixed(1)}%`));

  d.appendChild(g('Defence'));
  d.appendChild(row('Armour', String(p.armor),
    '<b>Armour</b><br>Reduces physical damage. The effect falls off against higher monster levels — ' +
    'you need more armour for the same protection deeper into the wild.'));
  if (p.dmgReduction) d.appendChild(row('Damage reduction', `${(p.dmgReduction * 100).toFixed(1)}%`));
  d.appendChild(row('Max life', String(p.maxHp)));
  d.appendChild(row('Life regeneration', `${p.lifeRegen.toFixed(1)}/s`));
  const cap = p.resCap ?? RES_CAP;
  d.appendChild(row('Cold resistance', `${p.res.cold}% / ${cap}%`));
  d.appendChild(row('Fire resistance', `${p.res.fire}% / ${cap}%`));
  d.appendChild(row('Lightning resistance', `${p.res.light}% / ${cap}%`));

  d.appendChild(g('Stamina'));
  d.appendChild(row('Max stamina', String(p.maxStamina),
    '<div class="tt-name">Stamina</div><div class="tt-core">Every swing and every skill costs. ' +
    'In combat you recover at only 40% — break contact for the full rate.</div>' +
    '<div class="tt-req">Every enemy felled gives 8 back.</div>'));
  d.appendChild(row('Cost per swing', (p.attackCost ?? 8).toFixed(1)));
  d.appendChild(row('Regeneration', `${p.staminaRegen.toFixed(1)}/s · ${(p.staminaRegen * 0.4).toFixed(1)}/s in combat`));

  d.appendChild(g('Mana'));
  d.appendChild(row('Max mana', String(p.maxMana),
    '<div class="tt-name">Mana</div><div class="tt-core">Only Frost skills draw mana. ' +
    'It refills at a steady rate and does not care whether you are fighting.</div>' +
    '<div class="tt-req">Gear and blessings are what raise it.</div>'));
  d.appendChild(row('Regeneration', `${p.manaRegen.toFixed(1)}/s`));

  d.appendChild(g('Other'));
  d.appendChild(row('Movement speed', `${Math.round(p.moveSpeed)}`));
  d.appendChild(row('Magic find', `+${p.magicFind}%`));
  if (p.reachMult > 1) d.appendChild(row('Reach', `+${Math.round((p.reachMult - 1) * 100)}%`));
  if (p.doubleStrike > 0) d.appendChild(row('Double strike', `${Math.round(p.doubleStrike * 100)}%`));
  if (p.xpMult > 1) d.appendChild(row('Experience', `+${Math.round((p.xpMult - 1) * 100)}%`));
  if (p.goldMult > 1) d.appendChild(row('Gold found', `+${Math.round((p.goldMult - 1) * 100)}%`));
  return d;
}

/* ------------------------------------------------------------------ */
/* Skill trees                                                         */
/* ------------------------------------------------------------------ */

/**
 * Out in the wilderness this is a read-only overview. At the hearth it is the
 * shop — same tree, but every node grows a price tag.
 * @param {any} game
 */
function skillsPanel(game) {
  const p = game.player;
  const shop = !!game.atHearth;
  const d = shell(shop ? 'The Hearth' : 'Skills', 'left',
    () => { panels.skills = false; game.atHearth = false; game.dirtyUI = true; });
  const redraw = () => { game.dirtyUI = true; };

  const head = document.createElement('div');
  head.className = 'shop-head';
  head.innerHTML = shop
    ? `<span>Buy ranks with gold.</span><span class="shop-gold">${p.gold}g</span>`
    : '<span>What you have learned. Ranks are bought at the hearth in Frosthem.</span>';
  d.appendChild(head);

  d.appendChild(skillTreeEl(game, { shop }, redraw));
  return d;
}

/* ------------------------------------------------------------------ */
/* Waystones                                                           */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function waypointPanel(game) {
  const d = shell('Waystones', 'left', () => { panels.waypoint = false; game.dirtyUI = true; });

  const intro = document.createElement('div');
  intro.className = 'tt-base';
  intro.style.marginBottom = '10px';
  intro.textContent = 'Travel to a place you have already found.';
  d.appendChild(intro);

  for (const z of game.waypointList()) {
    const row = document.createElement('div');
    row.className = 'node' + (z.known ? '' : ' locked');
    row.innerHTML = `<div class="ico">${glyph(z.index === 0 ? 'hearth' : 'waystone')}</div>` +
      `<div class="t"><b>${escape(z.name)}</b><i>${z.known ? (z.index === 0 ? 'The village' : `Monster level ${z.level}`) : 'Not discovered'}</i></div>` +
      `<div class="rk">${z.here ? 'here' : z.known ? '→' : glyph('lock')}</div>`;
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
  intro.textContent = 'Click something in the bag to sell it.';
  d.appendChild(intro);

  const potionPrice = 35 + p.level * 6;
  /** @param {string} icon @param {string} title @param {string} sub @param {number} price @param {()=>void} act */
  const offer = (icon, title, sub, price, act) => {
    const b = document.createElement('div');
    b.className = 'node';
    b.style.marginBottom = '6px';
    b.innerHTML = `<div class="ico">${glyph(icon)}</div><div class="t"><b>${title}</b><i>${sub}</i></div><div class="rk">${price}g</div>`;
    b.onclick = () => {
      if (p.gold < price) { game.alert('Not enough gold.'); return; }
      p.gold -= price; act(); game.dirtyUI = true; game.autosave?.();
    };
    d.appendChild(b);
  };
  offer('potion', 'Health potion', 'Restores 45% of your life', potionPrice, () => p.potions++);
  offer('potion', 'Five health potions', 'Fill the belt before the wild', potionPrice * 5, () => { p.potions += 5; });

  const junk = p.inventory.filter((/** @type {Item} */ i) => i.rarity === 'normal');
  const junkGold = junk.reduce((/** @type {number} */ a, /** @type {Item} */ i) => a + itemValue(i), 0);
  const sellAll = document.createElement('div');
  sellAll.className = 'node';
  sellAll.innerHTML = `<div class="ico">${glyph('gold')}</div><div class="t"><b>Sell all common</b><i>${junk.length} items</i></div><div class="rk">+${junkGold}g</div>`;
  sellAll.onclick = () => { for (const i of junk.slice()) sellItem(game, i); game.autosave?.(); };
  d.appendChild(sellAll);

  const gold = document.createElement('div');
  gold.className = 'row';
  gold.style.marginTop = '12px';
  gold.innerHTML = `<span>Your gold</span><span style="color:#d8b26a">${p.gold}</span>`;
  d.appendChild(gold);
  return d;
}

export { HOTBAR_SIZE };
