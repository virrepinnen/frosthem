// @ts-check
import { BASES } from '../data/items.js';
import { createPlayer } from '../entities/player.js';
import { recalc, xpToNext } from './stats.js';

/** @typedef {import('./loot.js').Item} Item */

const LEGACY_KEY = 'frosthem.save.v1';
export const SAVE_KEY = 'frosthem.saves.v2';

/**
 * The save is a *list* of characters, not a single slot. Every wanderer has
 * their own id, so you can have several on the go and pick one in the menu.
 * @typedef {Object} SaveRecord
 * @property {string} id
 * @property {number} t   Last saved (ms)
 * @property {string} name
 * @property {number} level
 */

/**
 * Items are serialised through the base type's id — base objects are shared
 * references and must never end up in the JSON.
 * @param {Item|null} it
 */
function packItem(it) {
  if (!it) return null;
  return {
    b: it.base.id, r: it.rarity, i: it.ilvl, n: it.name,
    a: it.affixes, m: it.mods, f: it.flavor, u: it.uniqueId,
  };
}

/** Mods that no longer do anything; stripped on load so no tooltip lies. */
const DEAD_MODS = ['str', 'dex', 'vit', 'will'];

/** @param {any} o @returns {Item|null} */
function unpackItem(o) {
  if (!o) return null;
  const base = BASES.find(b => b.id === o.b);
  if (!base) return null; // the base type no longer exists — skip the item
  const mods = { ...(o.m ?? {}) };
  for (const k of DEAD_MODS) delete mods[k];
  return {
    uid: Math.floor(Math.random() * 1e9), base, rarity: o.r, ilvl: o.i, name: o.n,
    affixes: (o.a ?? []).filter((/** @type {any} */ a) => !DEAD_MODS.includes(a.stat)),
    mods, flavor: o.f, uniqueId: o.u,
  };
}

/** @returns {any} the whole save file, always with a chars array */
function readAll() {
  /** @type {{v:number, chars:any[]}} */
  let data = { v: 2, chars: [] };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.chars)) data = d;
    }
    // A single character from the old format is migrated into the list once.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      if (old && old.v === 1) {
        old.id = old.id || newId();
        if (!data.chars.some(c => c.id === old.id)) data.chars.push(old);
      }
      localStorage.removeItem(LEGACY_KEY);
      writeAll(data);
    }
  } catch { /* broken or unavailable storage — start over empty */ }
  return data;
}

/** @param {any} data */
function writeAll(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Could not save:', e);
    return false;
  }
}

function newId() {
  return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** Every saved character, most recently played first. @returns {any[]} */
export function listSaves() {
  return readAll().chars.slice().sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
}

/** @param {string} id */
export function readSave(id) {
  return readAll().chars.find(c => c.id === id) ?? null;
}

/** @param {string} id */
export function deleteSave(id) {
  const data = readAll();
  data.chars = data.chars.filter(c => c.id !== id);
  return writeAll(data);
}

/**
 * Saves the active character. `game.charId` is set the first time.
 * @param {any} game
 */
export function saveGame(game) {
  const p = game.player;
  if (!game.charId) game.charId = newId();

  /** @type {Record<string, any>} */
  const equipment = {};
  for (const k in p.equipment) equipment[k] = packItem(p.equipment[k]);

  const rec = {
    v: 1, id: game.charId, t: Date.now(),
    name: p.name, level: p.level, xp: p.xp,
    boons: p.boons, boonPicks: p.boonPicks, milestonePicks: p.milestonePicks ?? 0,
    relics: p.relics ?? {},
    skills: p.skills, hotbar: p.hotbar,
    potions: p.potions, gold: p.gold, kills: p.kills, deaths: p.deaths,
    equipment, inventory: p.inventory.map(packItem),
    zoneIndex: game.zone?.isTown ? 0 : (game.zone?.index ?? 0),
    bossDefeated: game.bossDefeated,
    runs: game.runs ?? 0,
    bestDepth: game.bestDepth ?? 0,
  };

  const data = readAll();
  const i = data.chars.findIndex(c => c.id === rec.id);
  if (i >= 0) data.chars[i] = rec; else data.chars.push(rec);
  return writeAll(data);
}

/**
 * Builds a player from saved data. Unknown fields fall back to freshly created
 * values, so an old save can never produce a broken character.
 * @param {any} d
 */
export function playerFromSave(d) {
  const p = createPlayer(d.name);
  p.level = d.level ?? 1;
  p.xp = d.xp ?? 0;
  p.xpNext = xpToNext(p.level);
  p.boons = d.boons ?? {};
  p.relics = d.relics ?? {};
  p.milestonePicks = d.milestonePicks ?? 0;
  p.boonPicks = d.boonPicks ?? 0;
  p.skills = d.skills ?? {};
  // Characters saved before the rework carry attribute and skill points that no
  // longer have anywhere to go. Rather than drop them silently, unspent skill
  // points are refunded as gold — which is now what buys skill ranks — and the
  // attributes are simply gone, replaced by the level scaling in recalc.
  const refund = (d.skillPoints ?? 0) * 90 + (d.statPoints ?? 0) * 15;
  if (Array.isArray(d.hotbar)) {
    for (let i = 0; i < p.hotbar.length; i++) p.hotbar[i] = d.hotbar[i] ?? null;
  }
  p.potions = d.potions ?? 3;
  p.gold = (d.gold ?? 0) + refund;
  p.kills = d.kills ?? 0;
  p.deaths = d.deaths ?? 0;

  for (const k in p.equipment) p.equipment[k] = unpackItem(d.equipment?.[k]);
  p.inventory = (d.inventory ?? []).map(unpackItem).filter(Boolean);

  recalc(p);
  p.hp = p.maxHp;
  p.mana = p.maxMana;
  return p;
}

/** Short summary for the character list. @param {any} d */
export function describeSave(d) {
  const when = new Date(d.t ?? Date.now());
  const now = Date.now();
  const mins = Math.round((now - when.getTime()) / 60000);
  const rel = mins < 2 ? 'just now'
    : mins < 60 ? `${mins} min ago`
    : mins < 60 * 24 ? `${Math.round(mins / 60)} h ago`
    : when.toLocaleDateString('en-GB');
  return { rel, kills: d.kills ?? 0, gold: d.gold ?? 0, deaths: d.deaths ?? 0,
    runs: d.runs ?? 0, bestDepth: d.bestDepth ?? 0 };
}
