// @ts-check
import { recalc, canEquip } from './stats.js';
import { itemValue } from './loot.js';
import { slotsFor, BAG_COLS, BAG_ROWS } from '../entities/player.js';
import { itemSize } from '../data/items.js';
import { floatText } from '../render/fx.js';

/** @typedef {import('../systems/loot.js').Item} Item */
/** @typedef {import('../entities/player.js').Player} Player */

/**
 * Packar väskan i rutnätet. Föremålen läggs störst först, radvis uppifrån —
 * en enkel first-fit som ger samma resultat varje gång, så väskan inte hoppar
 * omkring mellan omritningar.
 *
 * Vi packar om automatiskt i stället för att låta spelaren dra runt föremål:
 * plockandet sker ändå automatiskt, och då vore manuell tetris bara pyssel.
 * @param {Item[]} items
 * @returns {{placed:{item:Item,x:number,y:number,w:number,h:number}[], overflow:Item[]}}
 */
export function packBag(items) {
  const grid = new Uint8Array(BAG_COLS * BAG_ROWS);
  const sized = items.map(it => ({ it, ...itemSize(it.base) }));
  sized.sort((a, b) => (b.h * b.w) - (a.h * a.w) || b.h - a.h || a.it.uid - b.it.uid);

  const fits = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) => {
    if (x + w > BAG_COLS || y + h > BAG_ROWS) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) if (grid[(y + dy) * BAG_COLS + x + dx]) return false;
    }
    return true;
  };
  const mark = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) grid[(y + dy) * BAG_COLS + x + dx] = 1;
    }
  };

  /** @type {{item:Item,x:number,y:number,w:number,h:number}[]} */
  const placed = [];
  /** @type {Item[]} */
  const overflow = [];
  for (const s of sized) {
    let done = false;
    for (let y = 0; y <= BAG_ROWS - s.h && !done; y++) {
      for (let x = 0; x <= BAG_COLS - s.w && !done; x++) {
        if (!fits(x, y, s.w, s.h)) continue;
        mark(x, y, s.w, s.h);
        placed.push({ item: s.it, x, y, w: s.w, h: s.h });
        done = true;
      }
    }
    if (!done) overflow.push(s.it);
  }
  return { placed, overflow };
}

/** Får ytterligare ett föremål plats? @param {Item[]} items @param {Item} extra */
export function canAdd(items, extra) {
  return packBag([...items, extra]).overflow.length === 0;
}

/** Hur många rutor som är upptagna respektive totalt. @param {Item[]} items */
export function bagUsage(items) {
  const used = items.reduce((a, it) => { const s = itemSize(it.base); return a + s.w * s.h; }, 0);
  return { used, total: BAG_COLS * BAG_ROWS };
}

/**
 * Utrusta ett föremål från väskan. Ringar går till första lediga ringplats.
 * @param {any} game @param {Item} item
 * @returns {boolean}
 */
export function equip(game, item) {
  const p = game.player;
  if (!canEquip(p, item)) { game.alert('Du saknar attribut för att bära det.'); return false; }

  const candidates = slotsFor(item.base.slot);
  let target = candidates.find(s => !p.equipment[s]) ?? candidates[0];

  const idx = p.inventory.indexOf(item);
  if (idx < 0) return false;

  // Byt på plats: det avtagna föremålet tar den lucka det nya lämnade. Att
  // splice:a ut och push:a sist kastade om hela väskan vid varje byte.
  const prev = p.equipment[target];
  p.equipment[target] = item;
  if (prev) p.inventory[idx] = prev;
  else p.inventory.splice(idx, 1);

  recalc(p);
  game.dirtyUI = true;
  game.alert(`Utrustade ${item.name}.`);
  return true;
}

/** @param {any} game @param {string} slot */
export function unequip(game, slot) {
  const p = game.player;
  const item = p.equipment[slot];
  if (!item) return false;
  if (!canAdd(p.inventory, item)) { game.alert('Väskan är full.'); return false; }
  p.equipment[slot] = null;
  p.inventory.push(item);
  recalc(p);
  game.dirtyUI = true;
  return true;
}

/** @param {any} game @param {Item} item */
export function dropItem(game, item) {
  const p = game.player;
  const idx = p.inventory.indexOf(item);
  if (idx < 0) return false;
  p.inventory.splice(idx, 1);
  // Oarmerat: automatplocket rör det inte förrän du gått ifrån det. Annars
  // sögs föremålet upp i samma stund som du släppte det.
  game.ground.push({ x: p.pos.x, y: p.pos.y + 20, kind: 'item', item, pop: 0.3, age: 0, armed: false });
  game.groundVersion++;
  game.dirtyUI = true;
  return true;
}

/** @param {any} game @param {Item} item */
export function sellItem(game, item) {
  const p = game.player;
  const idx = p.inventory.indexOf(item);
  if (idx < 0) return false;
  const v = itemValue(item);
  p.inventory.splice(idx, 1);
  p.gold += v;
  game.alert(`Sålde ${item.name} för ${v} guld.`);
  game.dirtyUI = true;
  return true;
}

/**
 * Plockar upp allt inom räckhåll (Space). Guld och drycker går alltid in;
 * föremål stannar kvar om väskan är full.
 * @param {any} game @param {number} [radius]
 */
export function pickupNearby(game, radius = 110) {
  const p = game.player;
  let took = 0;
  for (let i = game.ground.length - 1; i >= 0; i--) {
    const g = game.ground[i];
    if (Math.hypot(g.x - p.pos.x, g.y - p.pos.y) > radius) continue;
    if (!pickup(game, g)) continue;
    game.ground.splice(i, 1);
    game.groundVersion++;
    took++;
  }
  if (!took) game.alert('Inget inom räckhåll.');
  return took;
}

/** @param {any} game @param {any} g @returns {boolean} */
export function pickup(game, g) {
  const p = game.player;
  if (g.kind === 'gold') {
    p.gold += g.amount;
    floatText(p.pos.x, p.pos.y - 26, `+${g.amount} guld`, '#d8b26a', 13);
    game.dirtyUI = true;
    return true;
  }
  if (g.kind === 'potion') {
    p.potions += g.amount;
    floatText(p.pos.x, p.pos.y - 26, `+${g.amount} dryck`, '#e05a72', 13);
    game.dirtyUI = true;
    return true;
  }
  if (!canAdd(p.inventory, g.item)) { game.alert('Väskan är full.'); return false; }
  p.inventory.push(g.item);
  game.alert(`Plockade upp ${g.item.name}.`);
  game.dirtyUI = true;
  return true;
}
