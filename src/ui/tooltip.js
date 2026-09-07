// @ts-check
import { RARITY_COLOR } from '../data/items.js';
import { modLines, itemScore, itemValue } from '../systems/loot.js';
import { requirementsOf } from '../systems/stats.js';

/** @typedef {import('../systems/loot.js').Item} Item */

const el = () => /** @type {HTMLElement} */ (document.getElementById('tooltip'));

const RARITY_LABEL = { normal: '', magic: 'Magic', rare: 'Rare', unique: 'Unique' };

/**
 * @param {Item} item
 * @param {import('../entities/player.js').Player} p
 * @param {Item|null} [compareTo]
 * @param {string} [hint]
 */
export function showItemTooltip(item, p, compareTo, hint) {
  const t = el();
  const b = item.base;
  const req = requirementsOf(item);
  const reqOk = p.eff.str >= req.str && p.eff.dex >= req.dex;

  /** @type {string[]} */
  const core = [];
  if (b.dmgMin != null) {
    const mult = 1 + ((item.mods.dmgPct || 0) + p.eff.str) / 100;
    const lo = Math.round(b.dmgMin * mult + (item.mods.dmgFlat || 0));
    const hi = Math.round(b.dmgMax * mult + (item.mods.dmgFlat || 0));
    core.push(`Skada ${lo}–${hi}`);
    core.push(`Hastighet ${(b.speed ?? 1).toFixed(2)}×`);
  }
  if (b.armor) {
    const a = Math.round(b.armor * (1 + (item.mods.armorPct || 0) / 100) + (item.mods.armor || 0));
    core.push(`Rustning ${a}`);
  }

  const lines = modLines(item).filter(l => !/^\+0 /.test(l));

  let cmp = '';
  if (compareTo && compareTo !== item) {
    const d = itemScore(item) - itemScore(compareTo);
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
    const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '=';
    cmp = `<div class="tt-cmp">Compared with <b>${escape(compareTo.name)}</b>: <span class="${cls}">${arrow} ${d > 0 ? '+' : ''}${d}</span></div>`;
  }

  t.innerHTML = `
    <div class="tt-name" style="color:${RARITY_COLOR[item.rarity]}">${escape(item.name)}</div>
    <div class="tt-base">${escape(b.name)}${RARITY_LABEL[item.rarity] ? ' · ' + RARITY_LABEL[item.rarity] : ''} · item level ${item.ilvl}</div>
    ${core.length ? `<div class="tt-core">${core.join('<br>')}</div>` : ''}
    ${lines.length ? `<hr><div class="tt-mod">${lines.map(escape).join('<br>')}</div>` : ''}
    ${item.flavor ? `<hr><div class="tt-base" style="font-style:italic">${escape(item.flavor)}</div>` : ''}
    ${(req.str || req.dex) ? `<div class="tt-req ${reqOk ? '' : 'bad'}">Requires${req.str ? ` ${req.str} strength` : ''}${req.dex ? ` ${req.dex} dexterity` : ''}</div>` : ''}
    <div class="tt-req">Worth ${itemValue(item)} gold</div>
    ${cmp}
    ${hint ? `<div class="tt-hint">${escape(hint)}</div>` : ''}
  `;
  t.classList.remove('hidden');
}

/** @param {string} html */
export function showTextTooltip(html) {
  const t = el();
  t.innerHTML = html;
  t.classList.remove('hidden');
}

export function hideTooltip() { el().classList.add('hidden'); }

/** @param {number} x @param {number} y */
export function moveTooltip(x, y) {
  const t = el();
  if (t.classList.contains('hidden')) return;
  const r = t.getBoundingClientRect();
  let nx = x + 16, ny = y + 16;
  if (nx + r.width > innerWidth - 8) nx = x - r.width - 16;
  if (ny + r.height > innerHeight - 8) ny = Math.max(8, innerHeight - r.height - 8);
  t.style.left = nx + 'px';
  t.style.top = ny + 'px';
}

/** @param {string} s */
export function escape(s) {
  return String(s).replace(/[&<>"]/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
