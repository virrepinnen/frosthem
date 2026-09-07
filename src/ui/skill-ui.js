// @ts-check
import { SKILLS, SKILL_BY_ID, TREES, TIER_LEVEL, skillAvailability } from '../data/skills.js';
import { canBuy, buySkill, skillPrice } from '../systems/skillshop.js';
import { skillPower } from '../systems/stats.js';
import { glyph } from './glyphs.js';
import { showTextTooltip, hideTooltip, escape } from './tooltip.js';

/**
 * The skill trees, drawn once and used in two places.
 *
 * Out in the wilderness they are a read-only overview of what you have. At the
 * hearth in Frosthem the same tree grows price tags and becomes a shop. Drawing
 * both from one function means the two views can never disagree about what a
 * skill does or what it needs.
 */

/** @param {boolean} litA @param {boolean} litB @param {'straight'|'merge'} kind */
function branch(litA, litB, kind) {
  const b = document.createElement('div');
  b.className = 'branch';
  if (kind === 'straight') {
    b.innerHTML =
      `<i class="v ${litA ? 'on' : ''}" style="left:calc(25% - 1px);top:0;bottom:0"></i>` +
      `<i class="v ${litB ? 'on' : ''}" style="left:calc(75% - 1px);top:0;bottom:0"></i>`;
  } else {
    const on = litA && litB ? 'on' : '';
    b.style.height = '26px';
    b.innerHTML =
      `<i class="v ${litA ? 'on' : ''}" style="left:calc(25% - 1px);top:0;height:13px"></i>` +
      `<i class="v ${litB ? 'on' : ''}" style="left:calc(75% - 1px);top:0;height:13px"></i>` +
      `<i class="h ${on}" style="top:12px"></i>` +
      `<i class="v ${on}" style="left:calc(50% - 1px);top:12px;bottom:0"></i>`;
  }
  return b;
}

/**
 * @param {any} game @param {import('../data/skills.js').SkillDef} s
 * @param {boolean} shop @param {()=>void} onChange
 */
function skillNode(game, s, shop, onChange) {
  const p = game.player;
  const r = p.skills[s.id] || 0;
  const avail = skillAvailability(p.skills, p.level, s);
  const buy = canBuy(p, s);
  const slot = p.hotbar.indexOf(s.id);
  const maxed = r >= s.maxRank;

  const n = document.createElement('div');
  n.className = 'node sk' + (!avail.ok ? ' locked' : (shop && buy.ok) ? ' ready' : r > 0 ? ' avail' : '')
    + (maxed ? ' maxed' : '');
  n.innerHTML =
    `<div class="ico">${glyph(s.icon)}</div>` +
    `<div class="t"><b>${escape(s.name)}</b><i>${!avail.ok ? escape(avail.reason)
      : s.type === 'passive' ? 'Passive'
      : `${s.mana ? s.mana + ' mana' : (s.stamina ?? 0) + ' sta'} · ${s.cooldown ?? 0}s`}</i></div>` +
    `<div class="rk"><b>${r}</b><span class="rk-max">/${s.maxRank}</span></div>` +
    (shop ? `<div class="sk-buy${buy.ok ? '' : ' off'}">${maxed ? '—' : buy.price + 'g'}</div>` : '') +
    (slot >= 0 ? `<div class="hk">${slot + 1}</div>` : '');

  if (shop && buy.ok) {
    n.classList.add('buyable');
    n.onclick = () => { if (buySkill(game, s)) onChange(); };
  }

  n.onmouseenter = () => {
    const { synergy } = skillPower(p, s.id);
    const next = Math.min(r + 1, s.maxRank);
    showTextTooltip(
      `<div class="tt-name" style="color:#d8b26a">${escape(s.name)}</div>` +
      `<div class="tt-base">${TREES[s.tree]} · tier ${s.tier} · ${s.type === 'passive' ? 'passive'
        : s.mana ? `${s.mana} mana` : `${s.stamina ?? 0} stamina`} · rank ${r}/${s.maxRank}</div>` +
      (r > 0 ? `<div class="tt-core">${escape(s.desc(r, synergy)).replace(/\n/g, '<br>')}</div><hr>` : '') +
      (maxed ? '' :
        `<div class="tt-mod"><b>${r > 0 ? 'Next rank' : 'Rank 1'}:</b><br>` +
        `${escape(s.desc(next, synergy)).replace(/\n/g, '<br>')}</div>`) +
      (!avail.ok ? `<div class="tt-req bad">${escape(avail.reason)}</div>`
        : maxed ? '<div class="tt-req">Mastered</div>'
          : shop ? (buy.ok
            ? `<div class="tt-hint">Click to buy for ${buy.price} gold</div>`
            : `<div class="tt-req bad">${escape(buy.reason)}</div>`)
            : `<div class="tt-req">Next rank costs ${skillPrice(s, r)} gold at the hearth in Frosthem</div>`) +
      (r > 0 && s.type === 'active' ? '<div class="tt-hint">Right click: move to the next hotbar slot</div>' : ''));
  };
  n.onmouseleave = hideTooltip;
  if (r > 0 && s.type === 'active') {
    n.oncontextmenu = (e) => { e.preventDefault(); game.bindNext(s.id); };
  }
  return n;
}

/**
 * The whole skill tree with tabs.
 * @param {any} game @param {{shop?:boolean}} opts @param {()=>void} onChange
 */
export function skillTreeEl(game, opts, onChange) {
  const p = game.player;
  const shop = !!opts.shop;
  const wrap = document.createElement('div');

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  for (const [treeId, treeName] of Object.entries(TREES)) {
    const inTree = SKILLS.filter(x => x.tree === treeId);
    const spent = inTree.reduce((a, sk) => a + (p.skills[sk.id] || 0), 0);
    const t = document.createElement('div');
    t.className = 'tab' + (game.skillTab === treeId ? ' on' : '');
    t.innerHTML = `<b>${treeName}</b><i>${spent}</i>`;
    t.onclick = () => { game.skillTab = treeId; hideTooltip(); onChange(); };
    tabs.appendChild(t);
  }
  wrap.appendChild(tabs);

  const inTree = SKILLS.filter(x => x.tree === game.skillTab);
  const t1 = inTree.filter(x => x.tier === 1);
  const t2 = inTree.filter(x => x.tier === 2);
  const t3 = inTree.filter(x => x.tier === 3);
  const rank = (/** @type {string} */ id) => p.skills[id] || 0;

  const tree = document.createElement('div');
  tree.className = 'tree';
  const row = (/** @type {any[]} */ list, /** @type {string} */ cls) => {
    const r = document.createElement('div');
    r.className = 'tier' + cls;
    list.forEach(sk => r.appendChild(skillNode(game, sk, shop, onChange)));
    return r;
  };
  tree.appendChild(row(t1, ''));
  tree.appendChild(branch(rank(t1[0].id) > 0, rank(t1[1].id) > 0, 'straight'));
  tree.appendChild(row(t2, ''));
  tree.appendChild(branch(rank(t2[0].id) > 0, rank(t2[1].id) > 0, 'merge'));
  tree.appendChild(row(t3, ' cap'));
  wrap.appendChild(tree);

  const note = document.createElement('div');
  note.className = 'tt-req';
  note.innerHTML = shop
    ? `Tier 2 opens at level ${TIER_LEVEL[2]}, tier 3 at level ${TIER_LEVEL[3]} — and only once ` +
      'the branch above has a rank.'
    : 'Ranks are bought at the hearth in Frosthem, with gold.';
  wrap.appendChild(note);
  return wrap;
}

export { SKILLS, SKILL_BY_ID };
