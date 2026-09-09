// @ts-check
import { RES_CAP } from '../systems/stats.js';

/** @typedef {import('../entities/player.js').Player} Player */

/**
 * The character's numbers, described once.
 *
 * Both the sheet that shows them and the comparison that lights them up read
 * from this list, so a stat cannot appear in one and be missing from the other —
 * and a row can never highlight a number it is not the one displaying.
 *
 * `num` is what gets compared. It is a single number even where `text` shows a
 * range or a pair, because what a shield tells you is *which way* it moved you,
 * not the arithmetic.
 *
 * @typedef {Object} StatRow
 * @property {string} key
 * @property {string} label
 * @property {(p:Player)=>string} text   What is written in the row
 * @property {(p:Player)=>number} num    What is compared between two states
 * @property {boolean} [lowerIsBetter]
 * @property {(p:Player)=>boolean} [when] Shown only when this holds
 * @property {string} [group]
 * @property {(d:number)=>string} [delta] How the change is written
 */

const one = (/** @type {number} */ d) => (d > 0 ? '+' : '') + (Math.abs(d) < 10 ? d.toFixed(1) : Math.round(d));
const whole = (/** @type {number} */ d) => (d > 0 ? '+' : '') + Math.round(d);
const pct = (/** @type {number} */ d) => (d > 0 ? '+' : '') + d.toFixed(1) + '%';

/** @type {StatRow[]} */
export const STAT_ROWS = [
  { group: 'Offence', key: 'dmg', label: 'Damage',
    text: p => `${p.dmgMin}–${p.dmgMax}`, num: p => (p.dmgMin + p.dmgMax) / 2, delta: one },
  { key: 'attackSpeed', label: 'Attack speed',
    text: p => `${p.attackSpeed.toFixed(2)}×`, num: p => p.attackSpeed, delta: d => (d > 0 ? '+' : '') + d.toFixed(2) },
  { key: 'critChance', label: 'Critical hit',
    text: p => `${p.critChance.toFixed(1)}%`, num: p => p.critChance, delta: pct },
  { key: 'critMult', label: 'Critical damage',
    text: p => `×${(p.critMult / 100).toFixed(2)}`, num: p => p.critMult, delta: pct },
  { key: 'coldDmg', label: 'Cold damage', when: p => !!p.coldDmg,
    text: p => `+${Math.round(p.coldDmg)}`, num: p => p.coldDmg, delta: whole },
  { key: 'fireDmg', label: 'Fire damage', when: p => !!p.fireDmg,
    text: p => `+${p.fireDmg}`, num: p => p.fireDmg, delta: whole },
  { key: 'lightDmg', label: 'Lightning damage', when: p => !!p.lightDmg,
    text: p => `+${p.lightDmg}`, num: p => p.lightDmg, delta: whole },
  { key: 'lifeSteal', label: 'Life steal', when: p => !!p.lifeSteal,
    text: p => `${(p.lifeSteal * 100).toFixed(1)}%`, num: p => p.lifeSteal * 100, delta: pct },

  { group: 'Defence', key: 'armor', label: 'Armour',
    text: p => String(p.armor), num: p => p.armor, delta: whole },
  { key: 'maxHp', label: 'Max life', text: p => String(p.maxHp), num: p => p.maxHp, delta: whole },
  { key: 'lifeRegen', label: 'Life regeneration',
    text: p => `${(p.lifeRegen * 60).toFixed(0)}/min`, num: p => p.lifeRegen * 60, delta: whole },
  { key: 'dmgReduction', label: 'Damage reduction', when: p => !!p.dmgReduction,
    text: p => `${(p.dmgReduction * 100).toFixed(1)}%`, num: p => p.dmgReduction * 100, delta: pct },
  { key: 'resCold', label: 'Cold resistance',
    text: p => `${p.res.cold}% / ${p.resCap ?? RES_CAP}%`, num: p => p.res.cold, delta: pct },
  { key: 'resFire', label: 'Fire resistance',
    text: p => `${p.res.fire}% / ${p.resCap ?? RES_CAP}%`, num: p => p.res.fire, delta: pct },
  { key: 'resLight', label: 'Lightning resistance',
    text: p => `${p.res.light}% / ${p.resCap ?? RES_CAP}%`, num: p => p.res.light, delta: pct },

  { group: 'Other', key: 'maxMana', label: 'Max mana',
    text: p => String(p.maxMana), num: p => p.maxMana, delta: whole },
  { key: 'manaRegen', label: 'Mana regeneration',
    text: p => `${p.manaRegen.toFixed(1)}/s`, num: p => p.manaRegen, delta: one },
  { key: 'moveSpeed', label: 'Movement speed',
    text: p => String(Math.round(p.moveSpeed)), num: p => p.moveSpeed, delta: whole },
  { key: 'magicFind', label: 'Magic find', when: p => !!p.magicFind,
    text: p => `+${p.magicFind}%`, num: p => p.magicFind, delta: pct },
  { key: 'reach', label: 'Reach', when: p => p.reachMult > 1,
    text: p => `+${Math.round((p.reachMult - 1) * 100)}%`, num: p => p.reachMult * 100, delta: pct },
  { key: 'doubleStrike', label: 'Double strike', when: p => p.doubleStrike > 0,
    text: p => `${Math.round(p.doubleStrike * 100)}%`, num: p => p.doubleStrike * 100, delta: pct },
];

/** Everything the rows compare, as one flat object. @param {Player} p */
export function snapshotStats(p) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const r of STAT_ROWS) out[r.key] = r.num(p);
  return out;
}

/**
 * What changed between two snapshots, and by how much. Rows that did not move
 * are left out, so the sheet can light up exactly the ones that did.
 * @param {Record<string, number>} before @param {Record<string, number>} after
 */
export function diffStats(before, after) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const r of STAT_ROWS) {
    const d = (after[r.key] ?? 0) - (before[r.key] ?? 0);
    if (Math.abs(d) > 1e-6) out[r.key] = d;
  }
  return out;
}
