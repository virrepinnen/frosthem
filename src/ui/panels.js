// @ts-check
import { EQUIP_SLOTS, SLOT_LABEL, BAG_SIZE, HOTBAR_SIZE, bindToHotbar } from '../entities/player.js';
import { RARITY_COLOR } from '../data/items.js';
import { SKILLS, TREES, TIER_LEVEL, skillAvailability } from '../data/skills.js';
import { recalc, skillPower, rank, RES_CAP } from '../systems/stats.js';
import { equip, unequip, dropItem, sellItem } from '../systems/inventory.js';
import { itemValue } from '../systems/loot.js';
import { showItemTooltip, showTextTooltip, hideTooltip, escape } from './tooltip.js';

/** @typedef {import('../systems/loot.js').Item} Item */

export const panels = {
  inventory: false, character: false, skills: false, vendor: false, waypoint: false,
};

export function anyPanelOpen() {
  return panels.inventory || panels.character || panels.skills || panels.vendor || panels.waypoint;
}

/** @param {any} game @param {keyof typeof panels} name */
export function togglePanel(game, name) {
  const was = panels[name];
  if (name === 'vendor' && !was) panels.inventory = true;
  panels[name] = !was;
  if (name === 'inventory' && was) panels.vendor = false;
  hideTooltip();
  game.dirtyUI = true;
}

/** @param {any} game */
export function closeAllPanels(game) {
  panels.inventory = panels.character = panels.skills = panels.vendor = panels.waypoint = false;
  hideTooltip();
  game.dirtyUI = true;
}

const rarityClass = { normal: 'rn', magic: 'rm', rare: 'rr', unique: 'ru' };

/** @param {any} game */
export function renderPanels(game) {
  const root = /** @type {HTMLElement} */ (document.getElementById('panels'));
  root.innerHTML = '';
  if (panels.character) root.appendChild(characterPanel(game));
  if (panels.skills) root.appendChild(skillsPanel(game));
  if (panels.vendor) root.appendChild(vendorPanel(game));
  if (panels.waypoint) root.appendChild(waypointPanel(game));
  if (panels.inventory) root.appendChild(inventoryPanel(game));
  stackPanels(root);
}

/**
 * Flera paneler på samma sida får inte lägga sig ovanpå varandra.
 * @param {HTMLElement} root
 */
function stackPanels(root) {
  const gap = 12;
  for (const side of /** @type {const} */ (['left', 'right'])) {
    const list = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.panel.' + side)]);
    let offset = 22;
    for (const el of list) {
      const w = el.getBoundingClientRect().width || (el.classList.contains('wide') ? 392 : 330);
      if (offset + w > innerWidth / 2 - 20 && list.length > 1) {
        el.style[side] = (22 + list.indexOf(el) * 18) + 'px';
        el.style.top = (64 + list.indexOf(el) * 18) + 'px';
        continue;
      }
      el.style[side] = offset + 'px';
      offset += w + gap;
    }
  }
}

/** @param {string} title @param {'left'|'right'} side @param {()=>void} onClose @param {boolean} [wide] */
function shell(title, side, onClose, wide) {
  const d = document.createElement('div');
  d.className = `panel ${side}${wide ? ' wide' : ''}`;
  d.innerHTML = `<h2>${title}</h2><div class="close">✕</div>`;
  /** @type {HTMLElement} */ (d.querySelector('.close')).onclick = onClose;
  return d;
}

/* ------------------------------------------------------------------ */
/* Utrustningsdocka + väska                                            */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function inventoryPanel(game) {
  const p = game.player;
  const d = shell('Utrustning &amp; väska', 'right',
    () => { panels.inventory = false; panels.vendor = false; game.dirtyUI = true; }, true);

  const doll = document.createElement('div');
  doll.id = 'equip-doll';
  for (const slot of EQUIP_SLOTS) {
    const item = /** @type {Item|null} */ (p.equipment[slot]);
    const c = document.createElement('div');
    c.className = 'eq' + (item ? ' filled' : '');
    c.dataset.slot = slot;
    c.innerHTML = item
      ? `<div class="ic">${item.base.icon}</div><div class="nm" style="color:${RARITY_COLOR[item.rarity]}">${escape(shorten(item.name))}</div>`
      : SLOT_LABEL[slot];
    if (item) {
      c.onmouseenter = () => showItemTooltip(item, p, null, 'Klicka för att ta av');
      c.onmouseleave = hideTooltip;
      c.onclick = () => { unequip(game, slot); hideTooltip(); };
    }
    doll.appendChild(c);
  }
  d.appendChild(doll);

  const info = document.createElement('div');
  info.className = 'row';
  info.innerHTML = `<span>Drycker</span><span>🧪 ${p.potions}</span>`;
  d.appendChild(info);

  const head = document.createElement('div');
  head.className = 'grp';
  head.textContent = `Väska ${p.inventory.length}/${BAG_SIZE}${panels.vendor ? ' — klicka för att sälja' : ''}`;
  d.appendChild(head);

  const bag = document.createElement('div');
  bag.id = 'bag';
  for (let i = 0; i < BAG_SIZE; i++) {
    const item = /** @type {Item|undefined} */ (p.inventory[i]);
    const c = document.createElement('div');
    c.className = 'cell' + (item ? ' has ' + rarityClass[item.rarity] : '');
    if (item) {
      c.textContent = item.base.icon;
      const eqSlot = item.base.slot === 'ring' ? (p.equipment.ring1 ? 'ring2' : 'ring1') : item.base.slot;
      const cur = /** @type {Item|null} */ (p.equipment[eqSlot] ?? null);
      c.onmouseenter = () => showItemTooltip(item, p, cur,
        panels.vendor ? `Klicka: sälj för ${itemValue(item)} guld` : 'Klicka: utrusta · Högerklick: släng');
      c.onmouseleave = hideTooltip;
      c.onclick = () => { panels.vendor ? sellItem(game, item) : equip(game, item); hideTooltip(); };
      c.oncontextmenu = (e) => { e.preventDefault(); if (!panels.vendor) dropItem(game, item); hideTooltip(); };
    }
    bag.appendChild(c);
  }
  d.appendChild(bag);
  return d;
}

/** @param {string} s */
function shorten(s) { return s.length > 20 ? s.slice(0, 18) + '…' : s; }

/* ------------------------------------------------------------------ */
/* Karaktär                                                            */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function characterPanel(game) {
  const p = game.player;
  const d = shell(escape(p.name || 'Vandraren'), 'left', () => { panels.character = false; game.dirtyUI = true; });

  /** @param {string} label @param {string} value @param {string} [key] @param {string} [tip] */
  const row = (label, value, key, tip) => {
    const r = document.createElement('div');
    r.className = 'row';
    r.innerHTML = `<span>${label}</span><span>${value}</span>`;
    if (key && p.statPoints > 0) {
      const b = document.createElement('span');
      b.className = 'plus'; b.textContent = '+';
      b.onclick = () => {
        if (p.statPoints <= 0) return;
        p.statPoints--; p.stats[key]++;
        recalc(p); game.dirtyUI = true;
      };
      /** @type {HTMLElement} */ (r.children[0]).appendChild(b);
    }
    if (tip) { r.onmouseenter = () => showTextTooltip(tip); r.onmouseleave = hideTooltip; }
    return r;
  };
  const g = (/** @type {string} */ t) => {
    const e = document.createElement('div'); e.className = 'grp'; e.textContent = t; return e;
  };

  d.appendChild(row('Klass', 'Vandraren'));
  d.appendChild(row('Nivå', String(p.level)));
  d.appendChild(row('Erfarenhet', `${p.xp} / ${p.xpNext}`));
  d.appendChild(row('Fällda fiender', String(p.kills)));
  d.appendChild(row('Dödsfall', String(p.deaths)));

  d.appendChild(g(`Attribut${p.statPoints ? ` — ${p.statPoints} poäng kvar` : ''}`));
  d.appendChild(row('Styrka', String(p.eff.str), 'str', '<b>Styrka</b><br>+1% vapenskada per poäng. Krävs för tyngre vapen och rustningar.'));
  d.appendChild(row('Smidighet', String(p.eff.dex), 'dex', '<b>Smidighet</b><br>+0,15% attackhastighet, +0,12% kritisk träff och +0,4 rustning per poäng.'));
  d.appendChild(row('Vitalitet', String(p.eff.vit), 'vit', '<b>Vitalitet</b><br>+4 max liv per poäng.'));
  d.appendChild(row('Vilja', String(p.eff.will), 'will', '<b>Vilja</b><br>+3 uthållighet och snabbare återhämtning per poäng.'));

  d.appendChild(g('Strid'));
  d.appendChild(row('Skada', `${p.dmgMin}–${p.dmgMax}`));
  d.appendChild(row('Attackhastighet', `${p.attackSpeed.toFixed(2)}×`));
  d.appendChild(row('Kritisk träff', `${p.critChance.toFixed(1)}% (×${(p.critMult / 100).toFixed(2)})`));
  if (p.coldDmg) d.appendChild(row('Köldskada', `+${Math.round(p.coldDmg)}`));
  if (p.fireDmg) d.appendChild(row('Eldskada', `+${p.fireDmg}`));
  if (p.lightDmg) d.appendChild(row('Blixtskada', `+${p.lightDmg}`));
  if (p.freezeChance) d.appendChild(row('Chans att frysa', `${p.freezeChance}%`));
  if (p.lifeSteal) d.appendChild(row('Livsdräneri', `${(p.lifeSteal * 100).toFixed(1)}%`));

  d.appendChild(g('Försvar'));
  d.appendChild(row('Rustning', String(p.armor), undefined,
    '<b>Rustning</b><br>Minskar fysisk skada. Effekten avtar mot högre monsternivåer — ' +
    'du behöver mer rustning för samma skydd längre in i vildmarken.'));
  if (p.dmgReduction) d.appendChild(row('Skadereduktion', `${(p.dmgReduction * 100).toFixed(1)}%`));
  d.appendChild(row('Max liv', String(p.maxHp)));
  d.appendChild(row('Livsåterhämtning', `${p.lifeRegen.toFixed(1)}/s`));
  const cap = p.resCap ?? RES_CAP;
  d.appendChild(row('Köldmotstånd', `${p.res.cold}% / ${cap}%`));
  d.appendChild(row('Eldmotstånd', `${p.res.fire}% / ${cap}%`));
  d.appendChild(row('Blixtmotstånd', `${p.res.light}% / ${cap}%`));

  d.appendChild(g('Övrigt'));
  d.appendChild(row('Gånghastighet', `${Math.round(p.moveSpeed)}`));
  d.appendChild(row('Bättre fynd', `+${p.magicFind}%`));
  return d;
}

/* ------------------------------------------------------------------ */
/* Skill-träd                                                          */
/* ------------------------------------------------------------------ */

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

/** @param {any} game @param {import('../data/skills.js').SkillDef} s */
function skillNode(game, s) {
  const p = game.player;
  const r = rank(p, s.id);
  const avail = skillAvailability(p.skills, p.level, s);
  const canSpend = avail.ok && p.skillPoints > 0 && r < s.maxRank;
  const slot = p.hotbar.indexOf(s.id);

  const n = document.createElement('div');
  n.className = 'node sk' + (!avail.ok ? ' locked' : canSpend ? ' ready' : r > 0 ? ' avail' : '')
    + (r >= s.maxRank ? ' maxed' : '');
  n.innerHTML =
    `<div class="ico">${s.icon}</div>` +
    `<div class="t"><b>${s.name}</b><i>${!avail.ok ? avail.reason
      : s.type === 'passive' ? 'Passiv' : `${s.stamina ?? 0} uth · ${s.cooldown ?? 0}s`}</i></div>` +
    `<div class="rk">${r}/${s.maxRank}${canSpend ? ' +' : ''}</div>` +
    (slot >= 0 ? `<div class="hk">${slot + 1}</div>` : '');

  n.onmouseenter = () => {
    const { synergy } = skillPower(p, s.id);
    const next = Math.min(r + 1, s.maxRank);
    showTextTooltip(
      `<div class="tt-name" style="color:#d8b26a">${s.icon} ${escape(s.name)}</div>` +
      `<div class="tt-base">${TREES[s.tree]} · steg ${s.tier} · ${s.type === 'passive' ? 'passiv' : 'aktiv'} · rank ${r}/${s.maxRank}</div>` +
      (r > 0 ? `<div class="tt-core">${escape(s.desc(r, synergy)).replace(/\n/g, '<br>')}</div><hr>` : '') +
      `<div class="tt-mod"><b>${r > 0 ? 'Nästa rank' : 'Rank 1'}:</b><br>${escape(s.desc(next, synergy)).replace(/\n/g, '<br>')}</div>` +
      (!avail.ok ? `<div class="tt-req bad">${escape(avail.reason)}</div>`
        : canSpend ? '<div class="tt-hint">Klicka: lägg en poäng</div>'
          : p.skillPoints <= 0 && r < s.maxRank ? '<div class="tt-req">Inga skillpoäng kvar</div>' : '') +
      (r > 0 && s.type === 'active' ? '<div class="tt-hint">Högerklick: flytta till nästa snabbfack</div>' : '')
    );
  };
  n.onmouseleave = hideTooltip;

  if (canSpend) {
    n.onclick = () => {
      p.skillPoints--;
      p.skills[s.id] = (p.skills[s.id] || 0) + 1;
      if (s.type === 'active') bindToHotbar(p, s.id, false);
      recalc(p);
      game.dirtyUI = true;
      hideTooltip();
      game.autosave?.();
    };
  }
  if (r > 0 && s.type === 'active') {
    n.oncontextmenu = (e) => {
      e.preventDefault();
      bindToHotbar(p, s.id, true);
      game.dirtyUI = true;
    };
  }
  return n;
}

/** @param {any} game */
function skillsPanel(game) {
  const p = game.player;
  const d = shell(`Skills${p.skillPoints ? ` — ${p.skillPoints} poäng` : ''}`, 'left',
    () => { panels.skills = false; game.dirtyUI = true; });

  for (const [treeId, treeName] of Object.entries(TREES)) {
    const inTree = SKILLS.filter(x => x.tree === treeId);
    const t1 = inTree.filter(x => x.tier === 1);
    const t2 = inTree.filter(x => x.tier === 2);
    const t3 = inTree.filter(x => x.tier === 3);
    const spent = inTree.reduce((a, s) => a + rank(p, s.id), 0);

    const t = document.createElement('div');
    t.className = 'tree';
    const h = document.createElement('div');
    h.className = 'tree-name';
    h.innerHTML = `${treeName}<span>${spent} poäng</span>`;
    t.appendChild(h);

    const row1 = document.createElement('div'); row1.className = 'tier';
    t1.forEach(s => row1.appendChild(skillNode(game, s)));
    t.appendChild(row1);

    t.appendChild(branch(rank(p, t1[0].id) > 0, rank(p, t1[1].id) > 0, 'straight'));

    const row2 = document.createElement('div'); row2.className = 'tier';
    t2.forEach(s => row2.appendChild(skillNode(game, s)));
    t.appendChild(row2);

    t.appendChild(branch(rank(p, t2[0].id) > 0, rank(p, t2[1].id) > 0, 'merge'));

    const row3 = document.createElement('div'); row3.className = 'tier cap';
    t3.forEach(s => row3.appendChild(skillNode(game, s)));
    t.appendChild(row3);

    d.appendChild(t);
  }

  const note = document.createElement('div');
  note.className = 'tt-req';
  note.style.marginTop = '4px';
  note.innerHTML = `Steg 2 öppnas på nivå ${TIER_LEVEL[2]}, steg 3 på nivå ${TIER_LEVEL[3]} — och först när ` +
    'grenen ovanför har en poäng. Poängen är permanenta.';
  d.appendChild(note);
  return d;
}

/* ------------------------------------------------------------------ */
/* Vägstenar (waypoints)                                               */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function waypointPanel(game) {
  const d = shell('Vägstenar', 'left', () => { panels.waypoint = false; game.dirtyUI = true; });

  const intro = document.createElement('div');
  intro.className = 'tt-base';
  intro.style.marginBottom = '10px';
  intro.textContent = 'Res till en plats du redan hittat.';
  d.appendChild(intro);

  for (const z of game.waypointList()) {
    const row = document.createElement('div');
    row.className = 'node' + (z.known ? '' : ' locked');
    row.innerHTML = `<div class="ico">${z.index === 0 ? '🔥' : '🗿'}</div>` +
      `<div class="t"><b>${escape(z.name)}</b><i>${z.known ? (z.index === 0 ? 'Byn' : `Monsternivå ${z.level}`) : 'Inte upptäckt'}</i></div>` +
      `<div class="rk">${z.here ? 'här' : z.known ? '→' : '🔒'}</div>`;
    row.style.marginBottom = '6px';
    if (z.known && !z.here) row.onclick = () => { game.travelToWaypoint(z.index); closeAllPanels(game); };
    d.appendChild(row);
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Handlare                                                            */
/* ------------------------------------------------------------------ */

/** @param {any} game */
function vendorPanel(game) {
  const p = game.player;
  const d = shell('Gerd Askhand', 'left', () => { panels.vendor = false; game.dirtyUI = true; });

  const intro = document.createElement('div');
  intro.className = 'tt-base';
  intro.style.marginBottom = '10px';
  intro.textContent = 'Klicka på något i väskan för att sälja det.';
  d.appendChild(intro);

  const potionPrice = 35 + p.level * 6;
  /** @param {string} icon @param {string} title @param {string} sub @param {number} price @param {()=>void} act */
  const offer = (icon, title, sub, price, act) => {
    const b = document.createElement('div');
    b.className = 'node';
    b.style.marginBottom = '6px';
    b.innerHTML = `<div class="ico">${icon}</div><div class="t"><b>${title}</b><i>${sub}</i></div><div class="rk">${price}g</div>`;
    b.onclick = () => {
      if (p.gold < price) { game.alert('För lite guld.'); return; }
      p.gold -= price; act(); game.dirtyUI = true; game.autosave?.();
    };
    d.appendChild(b);
  };
  offer('🧪', 'Hälsodryck', 'Återställer 45% av ditt liv', potionPrice, () => p.potions++);
  offer('🧪', 'Fem hälsodrycker', 'Fyll bältet inför vildmarken', potionPrice * 5, () => { p.potions += 5; });

  const junk = p.inventory.filter((/** @type {Item} */ i) => i.rarity === 'normal');
  const junkGold = junk.reduce((/** @type {number} */ a, /** @type {Item} */ i) => a + itemValue(i), 0);
  const sellAll = document.createElement('div');
  sellAll.className = 'node';
  sellAll.innerHTML = `<div class="ico">🪙</div><div class="t"><b>Sälj allt vanligt</b><i>${junk.length} föremål</i></div><div class="rk">+${junkGold}g</div>`;
  sellAll.onclick = () => { for (const i of junk.slice()) sellItem(game, i); game.autosave?.(); };
  d.appendChild(sellAll);

  const gold = document.createElement('div');
  gold.className = 'row';
  gold.style.marginTop = '12px';
  gold.innerHTML = `<span>Ditt guld</span><span style="color:#d8b26a">${p.gold}</span>`;
  d.appendChild(gold);
  return d;
}

export { HOTBAR_SIZE };
