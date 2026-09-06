// @ts-check
import { BASES } from '../data/items.js';
import { createPlayer } from '../entities/player.js';
import { recalc, xpToNext } from './stats.js';

/** @typedef {import('./loot.js').Item} Item */

export const SAVE_KEY = 'frosthem.save.v1';

/**
 * Föremål serialiseras via bastypens id — bas-objekten är delade referenser och
 * ska aldrig hamna i JSON. Allt annat är redan enkla värden.
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

/** @param {any} game */
export function saveGame(game) {
  const p = game.player;
  /** @type {Record<string, any>} */
  const equipment = {};
  for (const k in p.equipment) equipment[k] = packItem(p.equipment[k]);

  const data = {
    v: 1, t: Date.now(),
    name: p.name, level: p.level, xp: p.xp,
    stats: p.stats, statPoints: p.statPoints, skillPoints: p.skillPoints,
    skills: p.skills, hotbar: p.hotbar,
    potions: p.potions, gold: p.gold, kills: p.kills, deaths: p.deaths,
    equipment, inventory: p.inventory.map(packItem),
    waypoints: [...game.waypoints],
    zoneIndex: game.zone?.isTown ? 0 : (game.zone?.index ?? 0),
    bossDefeated: game.bossDefeated,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Kunde inte spara:', e);
    return false;
  }
}

/** @returns {any|null} */
export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 ? d : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* strunt samma */ }
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
  return p;
}

/** Kort sammanfattning till startskärmen. @param {any} d */
export function describeSave(d) {
  const when = new Date(d.t ?? Date.now());
  const date = when.toLocaleDateString('sv-SE') + ' ' + when.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return `${d.name ?? 'Vandraren'} · nivå ${d.level ?? 1} · ${d.kills ?? 0} fällda · ${date}`;
}
