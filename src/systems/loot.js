// @ts-check
import { BASES, PREFIXES, SUFFIXES, UNIQUES, STAT_INFO, RARE_WORDS_A, RARE_WORDS_B } from '../data/items.js';
import { rng } from '../core/rng.js';

/** @typedef {import('../data/items.js').BaseItem} BaseItem */
/** @typedef {import('../data/items.js').Rarity} Rarity */
/** @typedef {import('../data/items.js').Slot} Slot */
/** @typedef {import('../data/items.js').AffixDef} AffixDef */
/** @typedef {Record<string, number>} Mods */

/**
 * @typedef {Object} RolledAffix
 * @property {string} id
 * @property {'prefix'|'suffix'} kind
 * @property {string} stat
 * @property {number} value
 * @property {string} label
 * @property {number} tier
 */

/**
 * @typedef {Object} Item
 * @property {number} uid
 * @property {BaseItem} base
 * @property {Rarity} rarity
 * @property {number} ilvl
 * @property {string} name
 * @property {RolledAffix[]} affixes
 * @property {Mods} mods       Sammanslagna modifierare (affixer + unik-mods)
 * @property {string} [flavor]
 * @property {string} [uniqueId]
 */

let nextUid = 1;

/**
 * Picks a base type. The weighting favours bases near the item's ilvl so that
 * "Rusty Axe" gradually stops dropping while "War Hammer" takes over.
 * @param {number} ilvl @param {Slot} [slot]
 * @returns {BaseItem|null}
 */
function pickBase(ilvl, slot) {
  const pool = BASES.filter(b => b.ilvl <= ilvl && (!slot || b.slot === slot));
  if (!pool.length) return null;
  return rng.weighted(pool, b => Math.max(1, 14 - (ilvl - b.ilvl)));
}

/**
 * Picks an affix tier among those the ilvl allows, leaning clearly towards the
 * highest available tiers.
 * @param {AffixDef} def @param {number} ilvl
 */
function pickTier(def, ilvl) {
  /** @type {{t: import('../data/items.js').AffixTier, i: number}[]} */
  const elig = [];
  def.tiers.forEach((t, i) => { if (t.ilvl <= ilvl) elig.push({ t, i }); });
  if (!elig.length) return null;
  const chosen = rng.weighted(elig, e => (e.t.w ?? 10) * Math.pow(1.55, e.i));
  return chosen;
}

/**
 * @param {AffixDef} def @param {number} ilvl
 * @returns {RolledAffix|null}
 */
function rollAffix(def, ilvl) {
  const picked = pickTier(def, ilvl);
  if (!picked) return null;
  const { t, i } = picked;
  const value = def.float
    ? Math.round(rng.range(t.min, t.max) * 10) / 10
    : rng.int(Math.round(t.min), Math.round(t.max));
  return { id: def.id, kind: def.kind, stat: def.stat, value, label: t.label, tier: i + 1 };
}

/** @param {RolledAffix[]} affixes @param {Mods} [extra] @returns {Mods} */
function combineMods(affixes, extra) {
  /** @type {Mods} */
  const mods = {};
  for (const a of affixes) mods[a.stat] = (mods[a.stat] || 0) + a.value;
  if (extra) for (const k in extra) mods[k] = (mods[k] || 0) + extra[k];
  return mods;
}

/**
 * Rolls rarity. Magic find shifts the curve upward — exactly as in D2, MF
 * affects the chance to upgrade, not the chance that anything drops at all.
 * @param {number} mf @param {number} boost
 * @returns {Rarity}
 */
function rollRarity(mf, boost) {
  const m = 1 + mf / 100;
  const r = rng.next();
  if (r < 0.006 * m * boost) return 'unique';
  if (r < 0.006 * m * boost + 0.075 * (1 + mf / 220) * boost) return 'rare';
  if (r < 0.30 * boost + 0.006) return 'magic';
  return 'normal';
}

/**
 * Generates an item.
 * @param {number} ilvl
 * @param {{mf?:number, boost?:number, slot?:Slot, forceRarity?:Rarity}} [opts]
 * @returns {Item|null}
 */
export function rollItem(ilvl, opts = {}) {
  const mf = opts.mf ?? 0;
  const boost = opts.boost ?? 1;
  let rarity = opts.forceRarity ?? rollRarity(mf, boost);

  // ---- unique: pick among the uniques whose ilvl requirement is met --------
  if (rarity === 'unique') {
    const pool = UNIQUES.filter(u => u.ilvl <= ilvl);
    if (pool.length) {
      const u = rng.pick(pool);
      const base = BASES.find(b => b.id === u.base);
      if (base) {
        return {
          uid: nextUid++, base, rarity: 'unique', ilvl, name: u.name,
          affixes: Object.entries(u.mods).map(([stat, value]) => (
            { id: 'u_' + stat, kind: /** @type {'prefix'} */ ('prefix'), stat, value, label: '', tier: 0 })),
          mods: { ...u.mods }, flavor: u.flavor, uniqueId: u.id,
        };
      }
    }
    rarity = 'rare'; // no unique available at this level yet
  }

  const base = pickBase(ilvl, opts.slot);
  if (!base) return null;

  const prefixPool = PREFIXES.filter(a => a.slots.includes(base.slot) && a.tiers.some(t => t.ilvl <= ilvl));
  const suffixPool = SUFFIXES.filter(a => a.slots.includes(base.slot) && a.tiers.some(t => t.ilvl <= ilvl));

  let nPre = 0, nSuf = 0;
  if (rarity === 'magic') {
    const both = rng.chance(0.4);
    if (both) { nPre = 1; nSuf = 1; }
    else if (rng.chance(0.5) && prefixPool.length) nPre = 1;
    else nSuf = 1;
  } else if (rarity === 'rare') {
    const total = rng.int(3, 5);
    nPre = Math.min(3, Math.ceil(total / 2));
    nSuf = Math.min(3, total - nPre);
  }
  // Jewellery has no base value at all, so it must always get at least one affix.
  if (rarity === 'normal' && (base.slot === 'ring' || base.slot === 'amulet')) { rarity = 'magic'; nSuf = 1; }

  /** @type {RolledAffix[]} */
  const affixes = [];
  const takeFrom = (/** @type {AffixDef[]} */ pool, /** @type {number} */ n) => {
    const shuffled = rng.shuffle(pool);
    let taken = 0;
    for (const def of shuffled) {
      if (taken >= n) break;
      if (affixes.some(a => a.id === def.id)) continue;
      const a = rollAffix(def, ilvl);
      if (a) { affixes.push(a); taken++; }
    }
  };
  takeFrom(prefixPool, nPre);
  takeFrom(suffixPool, nSuf);

  if (!affixes.length) rarity = 'normal';

  return {
    uid: nextUid++, base, rarity, ilvl, name: buildName(base, rarity, affixes),
    affixes, mods: combineMods(affixes),
  };
}

/**
 * @param {BaseItem} base @param {Rarity} rarity @param {RolledAffix[]} affixes
 */
function buildName(base, rarity, affixes) {
  if (rarity === 'normal') return base.name;
  if (rarity === 'rare') return rng.pick(RARE_WORDS_A) + rng.pick(RARE_WORDS_B);
  const pre = affixes.find(a => a.kind === 'prefix');
  const suf = affixes.find(a => a.kind === 'suffix');
  let n = base.name;
  if (pre) n = `${pre.label} ${n}`;
  if (suf) n = `${n} ${suf.label}`;
  return n;
}

/** Gold value when sold. @param {Item} item */
export function itemValue(item) {
  const rMult = { normal: 1, magic: 2.6, rare: 5.5, unique: 12 }[item.rarity];
  let v = item.base.value * rMult;
  for (const a of item.affixes) v += 8 + a.tier * 9;
  return Math.max(1, Math.round(v * (1 + item.ilvl * 0.03)));
}

/**
 * A rough score for deciding whether an item is an upgrade. Used only for the
 * arrows in the tooltip — the player decides for themselves.
 * @param {Item|null} item
 */
export function itemScore(item) {
  if (!item) return 0;
  const b = item.base;
  let s = ((b.dmgMin ?? 0) + (b.dmgMax ?? 0)) * 1.6 * (b.speed ?? 1) + (b.armor ?? 0) * 0.5;
  const w = /** @type {Record<string,number>} */ ({
    dmgPct: 0.9, dmgFlat: 3.4, attackSpeed: 1.4, critChance: 2.8, critMult: 0.5,
    coldDmg: 1.6, fireDmg: 1.6, lightDmg: 0.9, freezeChance: 0.8, lifeSteal: 5.0,
    armorPct: 0.5, armor: 0.8, life: 1.1, lifeRegen: 9, moveSpeed: 3.4,
    resCold: 0.8, resFire: 0.8, resLight: 0.8, resAll: 2.5, magicFind: 0.55,
  });
  for (const k in item.mods) s += (item.mods[k] || 0) * (w[k] ?? 0.5);
  return Math.round(s);
}

/** Sorted, readable mod lines. @param {Item} item */
export function modLines(item) {
  return Object.entries(item.mods)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => (STAT_INFO[a[0]]?.order ?? 99) - (STAT_INFO[b[0]]?.order ?? 99))
    .map(([stat, v]) => {
      const info = STAT_INFO[stat];
      return info ? `${info.fmt(v)} ${info.label.toLowerCase()}` : `${stat} ${v}`;
    });
}
