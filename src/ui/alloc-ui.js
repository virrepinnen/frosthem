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
 * Delade byggstenar för poängfördelning. Både nivårutan och panelerna ritar
 * exakt samma attributrutor och skill-träd, mot samma väntande hög — så det
 * kan aldrig stå olika saker på två ställen.
 */

/**
 * Enkla linjeikoner i stället för emoji: de tar färg från sitt sammanhang,
 * ser likadana ut på alla system och passar spelets torra ton.
 * @type {Record<string,string>}
 */
const ATTR_ICON = {
  // hantel
  str: '<path d="M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9"/>',
  // dubbla vinklar — fart
  dex: '<path d="M6 5.5L12.5 12 6 18.5M13 5.5L19.5 12 13 18.5"/>',
  // hjärta
  vit: '<path d="M12 19.5s-6.8-4.2-6.8-9A3.8 3.8 0 0 1 12 8.2a3.8 3.8 0 0 1 6.8 2.3c0 4.8-6.8 9-6.8 9z"/>',
  // fyruddig gnista
  will: '<path d="M12 3.8l2.1 6.1 6.1 2.1-6.1 2.1L12 20.2l-2.1-6.1L3.8 12l6.1-2.1z"/>',
};

/** Nyckeln heter 'will' av bakåtkompatibilitet; etiketten är Intelligens. */
export const ATTRS = /** @type {const} */ ([
  { key: 'str', label: 'Styrka', gain: '+1% vapenskada' },
  { key: 'dex', label: 'Smidighet', gain: '+0,15% attackhastighet · +0,4 rustning' },
  { key: 'vit', label: 'Vitalitet', gain: '+4 liv · +2 uthållighet' },
  { key: 'will', label: 'Intelligens', gain: '+4 mana' },
]);

/** @param {string} key */
function lineIcon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round">${ATTR_ICON[key] ?? ''}</svg>`;
}

/**
 * Attribut-tooltip som visar vad poängen *gör just nu*, inte bara vad den
 * heter. Ett tal utan sammanhang hjälper ingen att välja.
 * @param {any} p @param {string} key
 */
export function attrTooltip(p, key) {
  const head = (/** @type {string} */ t, /** @type {string} */ body) =>
    `<div class="tt-name" style="color:#d8b26a">${t}</div><div class="tt-core">${body}</div>`;
  switch (key) {
    case 'str':
      return head('Styrka', 'Varje poäng ger <b>+1% vapenskada</b>.' +
        `<hr>Nu: ${p.eff.str} styrka → +${p.eff.str}% skada` +
        `<br>Din skada: <b>${p.dmgMin}–${p.dmgMax}</b>`) +
        '<div class="tt-req">Tyngre vapen och rustningar kräver styrka för att kunna bäras.</div>';
    case 'dex':
      return head('Smidighet', 'Varje poäng ger <b>+0,15% attackhastighet</b>, ' +
        '<b>+0,12% kritisk träff</b> och <b>+0,4 rustning</b>.' +
        `<hr>Nu: ${p.eff.dex} smidighet` +
        `<br>Attackhastighet: <b>${p.attackSpeed.toFixed(2)}×</b>` +
        `<br>Kritisk träff: <b>${p.critChance.toFixed(1)}%</b>`) +
        '<div class="tt-req">Vissa vapen kräver smidighet.</div>';
    case 'vit':
      return head('Vitalitet', 'Varje poäng ger <b>+4 max liv</b> och <b>+2 uthållighet</b>.' +
        `<hr>Nu: ${p.eff.vit} vitalitet` +
        `<br>Liv: <b>${p.maxHp}</b> → ${p.maxHp + 4} med nästa poäng` +
        `<br>Uthållighet: <b>${p.maxStamina}</b> · återhämtning ${p.staminaRegen.toFixed(1)}/s` +
        `<br>Svep innan du är slut: <b>~${Math.floor(p.maxStamina / (p.attackCost || 8))}</b>`) +
        '<div class="tt-req">Barbarens attribut: både hur mycket du tål och hur länge du orkar.</div>';
    case 'will':
      return head('Intelligens', 'Varje poäng ger <b>+4 mana</b> och snabbare manaåterhämtning.' +
        `<hr>Nu: ${p.eff.will} intelligens → <b>${p.maxMana} mana</b>` +
        `<br>Återhämtning: <b>${p.manaRegen.toFixed(1)}/s</b>`) +
        '<div class="tt-req">Bara Frost-skills drar mana. Bygger du på stål och stryk ' +
        'räcker det med lite intelligens.</div>';
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
 * Fyra breda brickor. Varje bricka säger rakt ut vad *ett klick* ger, så man
 * inte behöver hovra för att veta vad poängen köper.
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
    minus.title = 'Ta tillbaka en poäng';
    minus.onclick = (e) => { e.stopPropagation(); if (removeStat(p, q, a.key)) onChange(); };
    btns.appendChild(minus);

    const plus = document.createElement('span');
    plus.className = 'ac-btn plus' + (statPointsLeft(p, q) > 0 ? '' : ' off');
    plus.textContent = '+';
    plus.title = 'Lägg en poäng';
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
      : s.type === 'passive' ? 'Passiv'
      : `${s.mana ? s.mana + ' mana' : (s.stamina ?? 0) + ' uth'} · ${s.cooldown ?? 0}s`}</i></div>` +
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
        : s.mana ? `${s.mana} mana` : `${s.stamina ?? 0} uthållighet`} · rank ${r}/${s.maxRank}</div>` +
      (r > 0 ? `<div class="tt-core">${escape(s.desc(r, synergy)).replace(/\n/g, '<br>')}</div><hr>` : '') +
      `<div class="tt-mod"><b>${r > 0 ? 'Nästa rank' : 'Rank 1'}:</b><br>` +
      `${escape(s.desc(next, synergy)).replace(/\n/g, '<br>')}</div>` +
      (!avail.ok ? `<div class="tt-req bad">${escape(avail.reason)}</div>`
        : canSpend ? '<div class="tt-hint">Klicka + för att lägga en poäng</div>'
          : skillPointsLeft(p, q) <= 0 && r < s.maxRank ? '<div class="tt-req">Inga skillpoäng kvar</div>' : '') +
      (base > 0 && s.type === 'active' ? '<div class="tt-hint">Högerklick: flytta till nästa snabbfack</div>' : ''));
  };
  n.onmouseleave = hideTooltip;
  if (base > 0 && s.type === 'active') {
    n.oncontextmenu = (e) => { e.preventDefault(); game.bindNext(s.id); };
  }
  return n;
}

/**
 * Hela skill-trädet med flikar.
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
  note.innerHTML = `Steg 2 öppnas på nivå ${TIER_LEVEL[2]}, steg 3 på nivå ${TIER_LEVEL[3]} — och först när ` +
    'grenen ovanför har en poäng.';
  wrap.appendChild(note);
  return wrap;
}

/**
 * Ångra/lås in — en egen rad per sorts poäng. Attribut och skills är olika
 * beslut och ska inte kunna bekräftas av misstag med varandra.
 * @param {any} game @param {'stats'|'skills'} kind @param {()=>void} onChange
 */
export function confirmBar(game, kind, onChange) {
  const q = game.pending;
  const n = kind === 'stats' ? pendingStats(q) : pendingSkills(q);
  if (n <= 0) return null;
  const what = kind === 'stats' ? 'attributpoäng' : 'skillpoäng';
  const bar = document.createElement('div');
  bar.className = 'confirm-bar';
  bar.innerHTML =
    '<button class="cb-undo">Ångra</button>' +
    `<button class="cb-ok">Lås in ${n} ${what}</button>`;
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
