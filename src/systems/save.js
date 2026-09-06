// @ts-check
import { BASES } from '../data/items.js';
import { createPlayer } from '../entities/player.js';
import { recalc, xpToNext } from './stats.js';

/** @typedef {import('./loot.js').Item} Item */

const LEGACY_KEY = 'frosthem.save.v1';
export const SAVE_KEY = 'frosthem.saves.v2';

/**
 * Sparningen är en *lista* av karaktärer, inte en enda plats. Varje vandrare
 * har ett eget id, så man kan ha flera på gång och välja i huvudmenyn.
 * @typedef {Object} SaveRecord
 * @property {string} id
 * @property {number} t   Senast sparad (ms)
 * @property {string} name
 * @property {number} level
 */

/**
 * Föremål serialiseras via bastypens id — bas-objekten är delade referenser och
 * ska aldrig hamna i JSON.
 * @param {Item|null} it
 */
function packItem(it) {
  if (!it) return null;
  return {
    b: it.base.id, r: it.rarity, i: it.ilvl, n: it.name,
    a: it.affixes, m: it.mods, f: it.flavor, u: it.uniqueId,
  };
}

/** @param {any} o @returns {Item|null} */
function unpackItem(o) {
  if (!o) return null;
  const base = BASES.find(b => b.id === o.b);
  if (!base) return null; // bastypen finns inte längre — hoppa över föremålet
  return {
    uid: Math.floor(Math.random() * 1e9), base, rarity: o.r, ilvl: o.i, name: o.n,
    affixes: o.a ?? [], mods: o.m ?? {}, flavor: o.f, uniqueId: o.u,
  };
}

/** @returns {any} hela sparfilen, alltid med en chars-array */
function readAll() {
  /** @type {{v:number, chars:any[]}} */
  let data = { v: 2, chars: [] };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.chars)) data = d;
    }
    // Enstaka karaktär från det gamla formatet flyttas in i listan en gång.
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
  } catch { /* trasig eller otillgänglig lagring — börja om tomt */ }
  return data;
}

/** @param {any} data */
function writeAll(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Kunde inte spara:', e);
    return false;
  }
}

function newId() {
  return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** Alla sparade karaktärer, senast spelad först. @returns {any[]} */
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
 * Sparar den aktiva karaktären. `game.charId` sätts första gången.
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
    stats: p.stats, statPoints: p.statPoints, skillPoints: p.skillPoints,
    skills: p.skills, hotbar: p.hotbar,
    potions: p.potions, gold: p.gold, kills: p.kills, deaths: p.deaths,
    equipment, inventory: p.inventory.map(packItem),
    waypoints: [...game.waypoints],
    zoneIndex: game.zone?.isTown ? 0 : (game.zone?.index ?? 0),
    bossDefeated: game.bossDefeated,
  };

  const data = readAll();
  const i = data.chars.findIndex(c => c.id === rec.id);
  if (i >= 0) data.chars[i] = rec; else data.chars.push(rec);
  return writeAll(data);
}

/**
 * Bygger en spelare ur sparad data. Okända fält faller tillbaka på nyskapade
 * värden, så ett gammalt sparläge kan aldrig producera en trasig karaktär.
 * @param {any} d
 */
export function playerFromSave(d) {
  const p = createPlayer(d.name);
  p.level = d.level ?? 1;
  p.xp = d.xp ?? 0;
  p.xpNext = xpToNext(p.level);
  p.stats = { ...p.stats, ...(d.stats ?? {}) };
  p.statPoints = d.statPoints ?? 0;
  p.skillPoints = d.skillPoints ?? 0;
  p.skills = d.skills ?? {};
  if (Array.isArray(d.hotbar)) {
    for (let i = 0; i < p.hotbar.length; i++) p.hotbar[i] = d.hotbar[i] ?? null;
  }
  p.potions = d.potions ?? 3;
  p.gold = d.gold ?? 0;
  p.kills = d.kills ?? 0;
  p.deaths = d.deaths ?? 0;

  for (const k in p.equipment) p.equipment[k] = unpackItem(d.equipment?.[k]);
  p.inventory = (d.inventory ?? []).map(unpackItem).filter(Boolean);

  recalc(p);
  p.hp = p.maxHp;
  p.stamina = p.maxStamina;
  p.mana = p.maxMana;
  return p;
}

/** Kort sammanfattning till karaktärslistan. @param {any} d */
export function describeSave(d) {
  const when = new Date(d.t ?? Date.now());
  const now = Date.now();
  const mins = Math.round((now - when.getTime()) / 60000);
  const rel = mins < 2 ? 'nyss'
    : mins < 60 ? `för ${mins} min sedan`
    : mins < 60 * 24 ? `för ${Math.round(mins / 60)} h sedan`
    : when.toLocaleDateString('sv-SE');
  return { rel, kills: d.kills ?? 0, gold: d.gold ?? 0, deaths: d.deaths ?? 0 };
}
