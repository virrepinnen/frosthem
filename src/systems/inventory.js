// @ts-check
import { recalc, canEquip } from './stats.js';
import { itemValue } from './loot.js';
import { slotsFor, BAG_SIZE } from '../entities/player.js';
import { floatText } from '../render/fx.js';

/** @typedef {import('../systems/loot.js').Item} Item */
/** @typedef {import('../entities/player.js').Player} Player */

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
  p.inventory.splice(idx, 1);

  const prev = p.equipment[target];
  p.equipment[target] = item;
  if (prev) p.inventory.push(prev);

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
  if (p.inventory.length >= BAG_SIZE) { game.alert('Väskan är full.'); return false; }
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
  game.ground.push({ x: p.pos.x, y: p.pos.y + 20, kind: 'item', item, pop: 0.3, age: 0 });
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
  if (p.inventory.length >= BAG_SIZE) { game.alert('Väskan är full.'); return false; }
  p.inventory.push(g.item);
  game.alert(`Plockade upp ${g.item.name}.`);
  game.dirtyUI = true;
  return true;
}
