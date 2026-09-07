// @ts-check
import { recalc, canEquip } from './stats.js';
import { itemValue } from './loot.js';
import { slotsFor, BAG_COLS, BAG_ROWS } from '../entities/player.js';
import { itemSize } from '../data/items.js';
import { floatText, burst } from '../render/fx.js';

/** @typedef {import('../systems/loot.js').Item} Item */
/** @typedef {import('../entities/player.js').Player} Player */

/**
 * Packs the bag into the grid. Items are placed largest first, row by row from
 * the top — a simple first-fit that gives the same result every time, so the
 * bag does not jump around between redraws.
 *
 * We repack automatically instead of letting the player drag items around:
 * picking up happens automatically anyway, so manual tetris would be busywork.
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

/** Does one more item fit? @param {Item[]} items @param {Item} extra */
export function canAdd(items, extra) {
  return packBag([...items, extra]).overflow.length === 0;
}

/** How many cells are used out of the total. @param {Item[]} items */
export function bagUsage(items) {
  const used = items.reduce((a, it) => { const s = itemSize(it.base); return a + s.w * s.h; }, 0);
  return { used, total: BAG_COLS * BAG_ROWS };
}

/**
 * Equip an item from the bag. Rings go to the first free ring slot.
 * @param {any} game @param {Item} item
 * @returns {boolean}
 */
export function equip(game, item) {
  const p = game.player;
  if (!canEquip(p, item)) { game.alert('You lack the attributes to carry that.'); return false; }

  const candidates = slotsFor(item.base.slot);
  let target = candidates.find(s => !p.equipment[s]) ?? candidates[0];

  const idx = p.inventory.indexOf(item);
  if (idx < 0) return false;

  // Swap in place: the removed item takes the gap the new one left behind.
  // Splicing out and pushing to the end reshuffled the whole bag on every swap.
  const prev = p.equipment[target];
  p.equipment[target] = item;
  if (prev) p.inventory[idx] = prev;
  else p.inventory.splice(idx, 1);

  recalc(p);
  game.dirtyUI = true;
  game.alert(`Equipped ${item.name}.`);
  return true;
}

/** @param {any} game @param {string} slot */
export function unequip(game, slot) {
  const p = game.player;
  const item = p.equipment[slot];
  if (!item) return false;
  if (!canAdd(p.inventory, item)) { game.alert('The bag is full.'); return false; }
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
  // Unarmed: auto-pickup leaves it alone until you have walked away. Otherwise
  // the item was sucked straight back up the moment you dropped it.
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
  game.alert(`Sold ${item.name} for ${v} gold.`);
  game.dirtyUI = true;
  return true;
}

/**
 * Picks up everything within reach (Space). Gold and potions always go in;
 * items stay on the ground if the bag is full.
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
  if (!took) game.alert('Nothing within reach.');
  return took;
}

/** @param {any} game @param {any} g @returns {boolean} */
export function pickup(game, g) {
  const p = game.player;
  if (g.kind === 'gold') {
    // Covetous applies on collection rather than on drop, so a blessing taken
    // mid-fight still pays out on the piles already lying there.
    const amount = Math.round(g.amount * (p.goldMult ?? 1));
    p.gold += amount;
    if (game.run) game.run.gold += amount;
    floatText(p.pos.x, p.pos.y - 26, `+${amount} gold`, '#d8b26a', 15);
    burst(p.pos.x, p.pos.y - 6, 9, { color: '#e8c884', speed: 110, life: 0.5, size: 2, grav: 240 });
    game.dirtyUI = true;
    return true;
  }
  if (g.kind === 'potion') {
    p.potions += g.amount;
    floatText(p.pos.x, p.pos.y - 26, `+${g.amount} potion`, '#e05a72', 13);
    game.dirtyUI = true;
    return true;
  }
  if (!canAdd(p.inventory, g.item)) { game.alert('The bag is full.'); return false; }
  p.inventory.push(g.item);
  game.alert(`Picked up ${g.item.name}.`);
  game.dirtyUI = true;
  return true;
}
