// @ts-check
import { SKILLS, TREES, TIER_LEVEL } from '../data/skills.js';
import {
  statWith, rankWith, statPointsLeft, skillPointsLeft, availabilityWith,
  addStat, removeStat, addSkill, removeSkill,
  pendingStats, pendingSkills, commitStats, commitSkills, resetStats, resetSkills,
} from '../systems/allocation.js';
import { skillPower } from '../systems/stats.js';
import { showTextTooltip, hideTooltip, escape } from './tooltip.js';

/**
 * Shared building blocks for point allocation. Both the level-up window and the
 * panels draw exactly the same attribute cards and skill trees, against the same
 * pending pile — so two places can never disagree.
 */

/**
 * Simple line icons instead of emoji: they take colour from their context, look
 * the same on every system and suit the game's dry tone.
 * @type {Record<string,string>}
 */
const ATTR_ICON = {
  // dumbbell
  str: '<path d="M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9"/>',
  // double chevrons — speed
  dex: '<path d="M6 5.5L12.5 12 6 18.5M13 5.5L19.5 12 13 18.5"/>',
  // heart
  vit: '<path d="M12 19.5s-6.8-4.2-6.8-9A3.8 3.8 0 0 1 12 8.2a3.8 3.8 0 0 1 6.8 2.3c0 4.8-6.8 9-6.8 9z"/>',
  // four-pointed spark
  will: '<path d="M12 3.8l2.1 6.1 6.1 2.1-6.1 2.1L12 20.2l-2.1-6.1L3.8 12l6.1-2.1z"/>',
};

/** The key is called 'will' for backwards compatibility; the label is Intelligence. */
export const ATTRS = /** @type {const} */ ([
  { key: 'str', label: 'Strength', gain: '+1% weapon damage' },
  { key: 'dex', label: 'Dexterity', gain: '+0.15% attack speed · +0.4 armour' },
  { key: 'vit', label: 'Vitality', gain: '+4 life · +2 stamina' },
  { key: 'will', label: 'Intelligence', gain: '+4 mana' },
]);

/** @param {string} key */
function lineIcon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round">${ATTR_ICON[key] ?? ''}</svg>`;
}

/**
 * Attribute tooltip showing what the point *does right now*, not just what it
 * is called. A number without context helps nobody choose.
 * @param {any} p @param {string} key
 */
export function attrTooltip(p, key) {
  const head = (/** @type {string} */ t, /** @type {string} */ body) =>
    `<div class="tt-name" style="color:#d8b26a">${t}</div><div class="tt-core">${body}</div>`;
  switch (key) {
    case 'str':
      return head('Strength', 'Every point gives <b>+1% weapon damage</b>.' +
        `<hr>Now: ${p.eff.str} strength → +${p.eff.str}% damage` +
        `<br>Your damage: <b>${p.dmgMin}–${p.dmgMax}</b>`) +
        '<div class="tt-req">Heavier weapons and armour require strength to be carried.</div>';
    case 'dex':
      return head('Dexterity', 'Every point gives <b>+0.15% attack speed</b>, ' +
        '<b>+0.12% critical hit</b> and <b>+0.4 armour</b>.' +
        `<hr>Now: ${p.eff.dex} dexterity` +
        `<br>Attack speed: <b>${p.attackSpeed.toFixed(2)}×</b>` +
        `<br>Critical hit: <b>${p.critChance.toFixed(1)}%</b>`) +
        '<div class="tt-req">Some weapons require dexterity.</div>';
    case 'vit':
      return head('Vitality', 'Every point gives <b>+4 max life</b> and <b>+2 stamina</b>.' +
        `<hr>Now: ${p.eff.vit} vitality` +
        `<br>Life: <b>${p.maxHp}</b> → ${p.maxHp + 4} with the next point` +
        `<br>Stamina: <b>${p.maxStamina}</b> · regeneration ${p.staminaRegen.toFixed(1)}/s` +
        `<br>Swings before you run dry: <b>~${Math.floor(p.maxStamina / (p.attackCost || 8))}</b>`) +
        '<div class="tt-req">The Barbarian&rsquo;s attribute: both how much you take and how long you last.</div>';
    case 'will':
      return head('Intelligence', 'Every point gives <b>+4 mana</b> and faster mana regeneration.' +
        `<hr>Now: ${p.eff.will} intelligence → <b>${p.maxMana} mana</b>` +
        `<br>Regeneration: <b>${p.manaRegen.toFixed(1)}/s</b>`) +
        '<div class="tt-req">Only Frost skills draw mana. Build on steel and force ' +
        'and a little intelligence is enough.</div>';
  }
  return '';
}

/** @param {number} n @param {string} label @param {string} [icon] */
export function pointsBadge(n, label, icon) {
  const b = document.createElement('div');
  b.className = 'points' + (n > 0 ? ' has' : '');
  b.innerHTML = `<span class="n">${n}</span><span class="l">${icon ? icon + ' ' : ''}${label}</span>`;
  return b;
}

/**
 * Four wide cards. Every card states outright what *one click* gives, so you do
 * not have to hover to know what the point buys.
 * @param {any} game @param {()=>void} onChange
 */
export function attributeCards(game, onChange) {
  const p = game.player;
  const q = game.pending;
  const wrap = document.createElement('div');
  wrap.className = 'attr-grid';

  for (const a of ATTRS) {
    const pend = q.stats[a.key] || 0;
    const card = document.createElement('div');
    card.className = 'attr-card' + (pend > 0 ? ' pending' : '');
    card.innerHTML =
      `<div class="ac-ico">${lineIcon(a.key)}</div>` +
      `<div class="ac-text"><b>${a.label}</b><i>${a.gain}</i></div>` +
      `<div class="ac-val">${statWith(p, q, a.key)}` +
      (pend > 0 ? `<span class="ac-delta">+${pend}</span>` : '') + '</div>' +
      '<div class="ac-btns"></div>';
    const btns = /** @type {HTMLElement} */ (card.querySelector('.ac-btns'));

    const minus = document.createElement('span');
    minus.className = 'ac-btn minus' + (pend > 0 ? '' : ' off');
    minus.textContent = '−';
    minus.title = 'Take back a point';
    minus.onclick = (e) => { e.stopPropagation(); if (removeStat(p, q, a.key)) onChange(); };
    btns.appendChild(minus);

    const plus = document.createElement('span');
    plus.className = 'ac-btn plus' + (statPointsLeft(p, q) > 0 ? '' : ' off');
    plus.textContent = '+';
    plus.title = 'Spend a point';
    plus.onclick = (e) => { e.stopPropagation(); if (addStat(p, q, a.key)) onChange(); };
    btns.appendChild(plus);

    card.onmouseenter = () => showTextTooltip(attrTooltip(p, a.key));
    card.onmouseleave = hideTooltip;
    wrap.appendChild(card);
  }
  return wrap;
}

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

/** @param {any} game @param {import('../data/skills.js').SkillDef} s @param {()=>void} onChange */
function skillNode(game, s, onChange) {
  const p = game.player;
  const q = game.pending;
  const base = p.skills[s.id] || 0;
  const pend = q.skills[s.id] || 0;
  const r = base + pend;
  const avail = availabilityWith(p, q, s);
  const canSpend = avail.ok && skillPointsLeft(p, q) > 0 && r < s.maxRank;
  const slot = p.hotbar.indexOf(s.id);

  const n = document.createElement('div');
  n.className = 'node sk' + (!avail.ok ? ' locked' : canSpend ? ' ready' : r > 0 ? ' avail' : '')
    + (r >= s.maxRank ? ' maxed' : '') + (pend > 0 ? ' pending' : '');
  n.innerHTML =
    `<div class="ico">${s.icon}</div>` +
    `<div class="t"><b>${s.name}</b><i>${!avail.ok ? avail.reason
      : s.type === 'passive' ? 'Passive'
      : `${s.mana ? s.mana + ' mana' : (s.stamina ?? 0) + ' sta'} · ${s.cooldown ?? 0}s`}</i></div>` +
    `<div class="rk"><b>${r}</b>${pend > 0 ? `<span class="rk-delta">+${pend}</span>` : ''}` +
    `<span class="rk-max">/${s.maxRank}</span></div>` +
    '<div class="sk-btns"></div>' +
    (slot >= 0 ? `<div class="hk">${slot + 1}</div>` : '');

  const btns = /** @type {HTMLElement} */ (n.querySelector('.sk-btns'));
  const minus = document.createElement('span');
  minus.className = 'ac-btn minus' + (pend > 0 ? '' : ' off');
  minus.textContent = '−';
  minus.onclick = (e) => { e.stopPropagation(); if (removeSkill(p, q, s.id)) onChange(); };
  btns.appendChild(minus);
  const plus = document.createElement('span');
  plus.className = 'ac-btn plus' + (canSpend ? '' : ' off');
  plus.textContent = '+';
  plus.onclick = (e) => { e.stopPropagation(); if (addSkill(p, q, s)) onChange(); };
  btns.appendChild(plus);

  n.onmouseenter = () => {
    const { synergy } = skillPower(p, s.id);
    const next = Math.min(r + 1, s.maxRank);
    showTextTooltip(
      `<div class="tt-name" style="color:#d8b26a">${s.icon} ${escape(s.name)}</div>` +
      `<div class="tt-base">${TREES[s.tree]} · steg ${s.tier} · ${s.type === 'passive' ? 'passiv'
        : s.mana ? `${s.mana} mana` : `${s.stamina ?? 0} stamina`} · rank ${r}/${s.maxRank}</div>` +
      (r > 0 ? `<div class="tt-core">${escape(s.desc(r, synergy)).replace(/\n/g, '<br>')}</div><hr>` : '') +
      `<div class="tt-mod"><b>${r > 0 ? 'Next rank' : 'Rank 1'}:</b><br>` +
      `${escape(s.desc(next, synergy)).replace(/\n/g, '<br>')}</div>` +
      (!avail.ok ? `<div class="tt-req bad">${escape(avail.reason)}</div>`
        : canSpend ? '<div class="tt-hint">Click + to spend a point</div>'
          : skillPointsLeft(p, q) <= 0 && r < s.maxRank ? '<div class="tt-req">No skill points left</div>' : '') +
      (base > 0 && s.type === 'active' ? '<div class="tt-hint">Right click: move to the next hotbar slot</div>' : ''));
  };
  n.onmouseleave = hideTooltip;
  if (base > 0 && s.type === 'active') {
    n.oncontextmenu = (e) => { e.preventDefault(); game.bindNext(s.id); };
  }
  return n;
}

/**
 * The whole skill tree with tabs.
 * @param {any} game @param {()=>void} onChange
 */
export function skillTreeEl(game, onChange) {
  const p = game.player;
  const q = game.pending;
  const wrap = document.createElement('div');

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  for (const [treeId, treeName] of Object.entries(TREES)) {
    const inTree = SKILLS.filter(x => x.tree === treeId);
    const spent = inTree.reduce((a, sk) => a + rankWith(p, q, sk.id), 0);
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

  const tree = document.createElement('div');
  tree.className = 'tree';
  const row = (/** @type {any[]} */ list, /** @type {string} */ cls) => {
    const r = document.createElement('div');
    r.className = 'tier' + cls;
    list.forEach(sk => r.appendChild(skillNode(game, sk, onChange)));
    return r;
  };
  tree.appendChild(row(t1, ''));
  tree.appendChild(branch(rankWith(p, q, t1[0].id) > 0, rankWith(p, q, t1[1].id) > 0, 'straight'));
  tree.appendChild(row(t2, ''));
  tree.appendChild(branch(rankWith(p, q, t2[0].id) > 0, rankWith(p, q, t2[1].id) > 0, 'merge'));
  tree.appendChild(row(t3, ' cap'));
  wrap.appendChild(tree);

  const note = document.createElement('div');
  note.className = 'tt-req';
  note.innerHTML = `Tier 2 opens at level ${TIER_LEVEL[2]}, tier 3 at level ${TIER_LEVEL[3]} — and only once ` +
    'the branch above has a point.';
  wrap.appendChild(note);
  return wrap;
}

/**
 * Undo/confirm — its own row per kind of point. Attributes and skills are
 * different decisions and must not be confirmable by accident together.
 * @param {any} game @param {'stats'|'skills'} kind @param {()=>void} onChange
 */
export function confirmBar(game, kind, onChange) {
  const q = game.pending;
  const n = kind === 'stats' ? pendingStats(q) : pendingSkills(q);
  if (n <= 0) return null;
  const what = kind === 'stats' ? 'attribute points' : 'skill points';
  const bar = document.createElement('div');
  bar.className = 'confirm-bar';
  bar.innerHTML =
    '<button class="cb-undo">Undo</button>' +
    `<button class="cb-ok">Confirm ${n} ${what}</button>`;
  /** @type {HTMLElement} */ (bar.querySelector('.cb-undo')).onclick = () => {
    if (kind === 'stats') resetStats(q); else resetSkills(q);
    onChange();
  };
  /** @type {HTMLElement} */ (bar.querySelector('.cb-ok')).onclick = () => {
    if (kind === 'stats') commitStats(game, q); else commitSkills(game, q);
    onChange();
  };
  return bar;
}

export { statPointsLeft, skillPointsLeft, pendingStats, pendingSkills };
