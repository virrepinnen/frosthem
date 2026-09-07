// @ts-check
import { rng } from '../core/rng.js';
import { angleDiff, clamp } from '../core/math.js';
import { armorReduction, skillPower, rank, KILL_STAMINA } from './stats.js';
import { rollItem } from './loot.js';
import { RARITY_COLOR } from '../data/items.js';
import { burst, floatText, decal, shake, screenFlash } from '../render/fx.js';
import { lineBlocked } from './world.js';
import { pickAttack } from '../render/hero.js';
import { spawnXpOrbs } from './orbs.js';

/** @typedef {import('../entities/monster.js').Monster} Monster */
/** @typedef {import('../entities/player.js').Player} Player */

const COLD = '#8fd8f4', FIRE = '#f5a04a', LIGHT = '#d7c2ff', CRIT = '#ffd166', PHYS = '#f0f4fa';

/* ------------------------------------------------------------------ */
/* Status effects                                                      */
/* ------------------------------------------------------------------ */

/** @param {Monster} m @param {number} amt @param {number} dur */
export function applySlow(m, amt, dur) {
  if (amt >= m.slowAmt || m.slowT <= 0) { m.slowAmt = Math.max(m.slowAmt, amt); }
  m.slowT = Math.max(m.slowT, dur);
}
/** @param {Monster} m @param {number} dur */
export function applyFreeze(m, dur) {
  if (m.isBoss) dur *= 0.35;
  m.freezeT = Math.max(m.freezeT, dur);
  burst(m.pos.x, m.pos.y, 10, { color: COLD, speed: 90, life: 0.6, size: 2.5, shape: 'shard' });
}
/** @param {Monster} m @param {number} dur */
export function applyStun(m, dur) {
  if (m.isBoss) dur *= 0.4;
  m.stunT = Math.max(m.stunT, dur);
}
/** @param {Monster} m @param {number} dps @param {number} dur */
export function applyBleed(m, dps, dur) {
  m.bleed = { t: dur, dps: Math.max(dps, m.bleed?.dps ?? 0) };
}

/* ------------------------------------------------------------------ */
/* Damage to monsters                                                  */
/* ------------------------------------------------------------------ */

/**
 * @param {any} game
 * @param {Monster} m
 * @param {{phys?:number, cold?:number, fire?:number, light?:number, crit?:boolean, ignoreArmor?:boolean, silent?:boolean}} d
 * @returns {number} faktiskt utdelad skada
 */
export function hitMonster(game, m, d) {
  if (m.dead) return 0;
  const p = game.player;
  let total = 0;

  if (d.phys) {
    const red = d.ignoreArmor ? 0 : armorReduction(m.armor, p.level);
    total += d.phys * (1 - red);
  }
  if (d.cold)  total += d.cold  * (1 - clamp(m.res.cold  || 0, -100, 95) / 100);
  if (d.fire)  total += d.fire  * (1 - clamp(m.res.fire  || 0, -100, 95) / 100);
  if (d.light) total += d.light * (1 - clamp(m.res.light || 0, -100, 95) / 100);

  total = Math.max(1, Math.round(total));

  // The first hit wakes whatever is sleeping. Strike the jarl and the whole
  // arena rises with him.
  if (m.dormant) {
    m.dormant = false;
    m.state = 'chase';
    if (m.isBoss) {
      m.bossState = null;               // restarts with a full wind-up
      for (const o of game.monsters) {
        if (o === m || o.dead) continue;
        if (Math.hypot(o.pos.x - m.pos.x, o.pos.y - m.pos.y) < 460) { o.dormant = false; o.state = 'chase'; }
      }
      game.alert(`${m.name} rises.`);
      burst(m.pos.x, m.pos.y, 70, { color: '#a8e4f8', speed: 300, life: 1.1, size: 3.4, grav: -40 });
      screenFlash(0.3, '#7fd4f0');
      shake(14);
      game.novas.push({ x: m.pos.x, y: m.pos.y, t: 0, dur: 0.7, r: 300, color: '#a8e4f8' });
    }
  }

  m.hp -= total;
  m.hitFlash = 0.14;
  game.lastTarget = m;
  game.lastTargetT = 2.5;

  if (!d.silent) {
    const color = d.crit ? CRIT : (d.cold && !d.phys) ? COLD : (d.fire && !d.phys) ? FIRE : PHYS;
    floatText(m.pos.x, m.pos.y - m.radius - 6, d.crit ? `${total}!` : `${total}`, color, d.crit ? 19 : 14);
    burst(m.pos.x, m.pos.y, d.crit ? 12 : 6, {
      color: d.cold && !d.phys ? COLD : '#b2313f', speed: d.crit ? 200 : 130, life: 0.4, size: 2.6,
    });
  }

  // life steal for the player
  if (d.phys && p.lifeSteal > 0) {
    const heal = total * p.lifeSteal;
    p.hp = Math.min(p.maxHp, p.hp + heal);
  }

  if (m.hp <= 0) killMonster(game, m);
  return total;
}

/** @param {any} game @param {Monster} m */
export function killMonster(game, m) {
  if (m.dead) return;
  m.dead = true;
  m.corpseT = 14;
  game.player.kills++;
  // A felled target grants breathing room. That keeps pack-clearing sustainable
  // while punishing missed swings — exactly the trade-off stamina should create.
  game.player.stamina = Math.min(game.player.maxStamina, game.player.stamina + KILL_STAMINA);

  decal(m.pos.x, m.pos.y, m.radius * (m.isBoss ? 3.2 : 1.5), 'rgba(120,20,30,0.5)');
  burst(m.pos.x, m.pos.y, m.isBoss ? 90 : 18, { color: '#a8202a', speed: m.isBoss ? 320 : 190, life: 0.75, size: 3.2 });
  burst(m.pos.x, m.pos.y, 12, { color: '#e8f0fa', speed: 120, life: 0.9, size: 2, grav: -20 });
  if (m.isBoss) { shake(18); screenFlash(0.4, '#7fd4f0'); }
  else if (m.elite) shake(6);

  // The buff is applied when the orbs are swept up, not when they drop —
  // otherwise it would count twice.
  const xpGain = m.xp;
  spawnXpOrbs(game, m.pos.x, m.pos.y, xpGain);

  dropLoot(game, m);
}


/* ------------------------------------------------------------------ */
/* Loot                                                                */
/* ------------------------------------------------------------------ */

/** @param {any} game @param {Monster} m */
function dropLoot(game, m) {
  const p = game.player;
  const ilvl = Math.max(1, m.level + (m.isBoss ? 4 : m.elite ? 2 : m.isChampion ? 1 : 0));
  const mf = p.magicFind;

  // The drop rate is deliberately low, and lower than it was. With automatic
  // pickup every item is otherwise noise in the bag — the rarity is the point,
  // and a drop that happens once a pack should stop you where you stand.
  let itemRolls = 0, boost = 1;
  if (m.isBoss) { itemRolls = 3; boost = 4.5; }
  else if (m.elite) { itemRolls = rng.chance(0.35) ? 2 : 1; boost = 3.2; }
  else if (m.isChampion) { itemRolls = rng.chance(0.2) ? 1 : 0; boost = 2.4; }
  else if (rng.chance(0.02)) itemRolls = 1;

  for (let i = 0; i < itemRolls; i++) {
    const forced = m.isBoss ? /** @type {const} */ ('rare') : undefined;
    const item = rollItem(ilvl, { mf, boost, forceRarity: forced });
    if (!item) continue;
    // Plain white junk never reaches the ground outside chests. If a drop is
    // this rare it had better be worth looking at.
    if (item.rarity === 'normal' && !m.isBoss) continue;
    spawnGround(game, m.pos.x, m.pos.y, { kind: 'item', item });
    announceDrop(game, item, m.pos.x, m.pos.y);
  }

  // Fewer but heavier piles. Gold now buys skill ranks at the hearth, so each
  // pile is a step towards something rather than a number ticking up.
  const goldChance = m.isBoss ? 1 : m.elite ? 1 : m.isChampion ? 0.4 : 0.1;
  if (rng.chance(goldChance)) {
    const base = 4 + m.level * 3.2;
    const amount = Math.round(base * rng.range(0.7, 1.7) * (m.isBoss ? 16 : m.elite ? 6 : m.isChampion ? 3.2 : 4));
    spawnGround(game, m.pos.x, m.pos.y, { kind: 'gold', amount });
  }
  if (rng.chance(m.isBoss ? 1 : m.elite ? 0.5 : 0.07)) {
    spawnGround(game, m.pos.x, m.pos.y, { kind: 'potion', amount: m.isBoss ? 5 : 1 });
  }
}

/**
 * The moment a drop lands. A rare or unique should register before you have
 * read the label — a burst in its own colour, and for the best of them a flash
 * and a line in the notices, so you look up rather than walk past.
 * @param {any} game @param {any} item @param {number} x @param {number} y
 */
export function announceDrop(game, item, x, y) {
  const col = RARITY_COLOR[item.rarity];
  const big = item.rarity === 'rare' || item.rarity === 'unique';
  burst(x, y, big ? 34 : 14, {
    color: col, speed: big ? 190 : 110, life: big ? 1.1 : 0.6,
    size: big ? 3 : 2.2, grav: -60,
  });
  if (!big) return;
  screenFlash(item.rarity === 'unique' ? 0.24 : 0.14, col);
  game.alert(`${item.rarity === 'unique' ? 'Unique' : 'Rare'}: ${item.name}`);
}

/** @param {any} game @param {number} x @param {number} y @param {any} payload */
export function spawnGround(game, x, y, payload) {
  const a = rng.range(0, Math.PI * 2), r = rng.range(8, 46);
  game.ground.push({
    x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
    pop: 0.45, age: 0, ...payload,
  });
  game.groundVersion++;
}

/* ------------------------------------------------------------------ */
/* The player's attacks                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolves a swing: everything within the arc and reach is hit immediately.
 * Instant hit detection (no wind-up) makes the attack feel responsive, while
 * the animation plays out afterwards.
 * @param {any} game
 * @param {{arc:number, reach:number, mult:number, kind:string, cold?:number, freeze?:number,
 *          bleed?:{dps:number,dur:number}, stun?:number, ignoreArmor?:boolean,
 *          dir?:number, knock?:number}} o
 */
export function performSwing(game, o) {
  const p = game.player;
  const dir = o.dir ?? p.facing;
  let hits = 0;

  // Wide Arc stretches both how far and how wide a swing reaches. The arc is
  // capped so a full circle stays a full circle rather than wrapping past it.
  const reach = o.reach * (p.reachMult ?? 1);
  const arc = Math.min(Math.PI * 2, o.arc * (p.reachMult ?? 1));
  // Double Strike rolls once per swing, not per target: a swing lands twice or
  // it does not, which reads clearly and keeps the numbers honest.
  const twice = (p.doubleStrike ?? 0) > 0 && rng.chance(p.doubleStrike);

  for (const m of game.monsters) {
    if (m.dead) continue;
    const dx = m.pos.x - p.pos.x, dy = m.pos.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + m.radius) continue;
    if (arc < Math.PI * 1.99 && angleDiff(Math.atan2(dy, dx), dir) > arc / 2) continue;
    // No damage through rock walls — you could clear the whole quarry from outside.
    if (lineBlocked(game.zone, p.pos.x, p.pos.y, m.pos.x, m.pos.y)) continue;

    const elemScale = 0.5 + 0.5 * o.mult;
    for (let strike = 0; strike < (twice ? 2 : 1); strike++) {
      if (m.dead) break;
      const roll = rng.range(p.dmgMin, p.dmgMax) * o.mult * (1 + p.dmgBuff + (p.shrineDmg || 0));
      const crit = rng.chance(p.critChance / 100);
      const phys = crit ? roll * (p.critMult / 100) : roll;
      hitMonster(game, m, {
        phys,
        cold: (p.coldDmg + (o.cold ?? 0)) * elemScale,
        fire: p.fireDmg * elemScale,
        light: p.lightDmg * elemScale,
        crit, ignoreArmor: o.ignoreArmor,
      });
    }

    if (o.bleed) applyBleed(m, o.bleed.dps, o.bleed.dur);
    if (o.stun) applyStun(m, o.stun);
    const fz = (o.freeze ?? 0) + p.freezeChance;
    if (fz > 0 && rng.chance(fz / 100)) applyFreeze(m, 2);
    if (o.knock && !m.isBoss) {
      const k = o.knock / Math.max(1, d);
      m.vel.x += dx * k; m.vel.y += dy * k;
    }
    hits++;
  }

  // The variant decides both how the strike looks and how long the animation
  // takes. Heavier blows get more time — they should be felt in the hand, not
  // just in the numbers.
  const variant = o.kind === 'whirl' ? null : pickAttack(p, o.kind);
  const stretch = variant === 'overhead' ? 1.5 : variant === 'thrust' ? 1.2 : 1;
  p.swing = {
    t: 0, dur: Math.max(0.16, 0.3 / p.attackSpeed) * stretch,
    dir, arc, reach, kind: o.kind, variant,
  };
  if (hits) shake(o.kind === 'basic' ? 1.6 : 3.4);
  return hits;
}

/**
 * Uses a skill. Returns false if it could not be used.
 * @param {any} game @param {string} id
 */
export function useSkill(game, id) {
  const p = game.player;
  const def = game.skillDefs.get(id);
  if (!def || def.type === 'passive') return false;
  const r = rank(p, id);
  if (r <= 0) return false;
  if ((p.cooldowns[id] ?? 0) > 0) return false;
  if (p.whirl || p.dash) return false;
  // Every skill draws its own resource: Frost costs mana, the rest stamina.
  if (def.mana && p.mana < def.mana) { game.alert('Not enough mana.'); p.manaFlash = 0.45; return false; }
  if (def.stamina && p.stamina < def.stamina) { game.alert('Not enough stamina.'); p.staminaFlash = 0.45; return false; }

  const { synergy } = skillPower(p, id);
  if (def.stamina) { p.stamina -= def.stamina; p.combatT = 1.5; }
  if (def.mana) p.mana -= def.mana;
  p.cooldowns[id] = def.cooldown ?? 0;

  switch (id) {
    case 'cleave':
      performSwing(game, { arc: 2.27, reach: 82, mult: (115 + r * 14 + synergy) / 100, kind: 'cleave', knock: 40 });
      break;

    case 'rend':
      performSwing(game, {
        arc: 1.5, reach: 74, mult: (40 + r * 10) / 100, kind: 'rend',
        bleed: { dps: 3 + r * 1.6, dur: 6 },
      });
      break;

    case 'crush':
      performSwing(game, {
        arc: 1.0, reach: 76, mult: (175 + r * 24 + synergy) / 100, kind: 'crush',
        stun: 0.8 + r * 0.1, knock: 260,
      });
      shake(6);
      break;

    case 'whirlwind':
      p.whirl = { t: 1.4, tick: 0 };
      break;

    case 'icenova': {
      const dmg = 14 + r * 9 + synergy;
      for (const m of game.monsters) {
        if (m.dead) continue;
        const d = Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y);
        if (d > 175 + m.radius) continue;
        if (lineBlocked(game.zone, p.pos.x, p.pos.y, m.pos.x, m.pos.y)) continue;
        hitMonster(game, m, { cold: dmg });
        applySlow(m, 0.45, 3);
      }
      game.novas.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.45, r: 175 });
      burst(p.pos.x, p.pos.y, 46, { color: COLD, speed: 320, life: 0.55, size: 3, grav: 30, shape: 'shard' });
      shake(4);
      break;
    }

    case 'shatter':
      p.dash = { t: 0.2, dir: p.facing, hit: new Set() };
      p.pendingShatter = { mult: (130 + r * 20) / 100, cold: 8 + r * 6, freeze: Math.min(15 + r * 5, 65) };
      break;

    case 'wintergrasp': {
      const dmg = 30 + r * 16 + synergy;
      for (const m of game.monsters) {
        if (m.dead) continue;
        if (Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y) > 300 + m.radius) continue;
        if (lineBlocked(game.zone, p.pos.x, p.pos.y, m.pos.x, m.pos.y)) continue;
        hitMonster(game, m, { cold: dmg });
        applyFreeze(m, 2.4 + r * 0.2);
      }
      game.novas.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.8, r: 300 });
      burst(p.pos.x, p.pos.y, 90, { color: COLD, speed: 420, life: 0.9, size: 3.4, grav: 20, shape: 'shard' });
      screenFlash(0.22, '#7fd4f0');
      shake(10);
      break;
    }

    case 'warcry': {
      let n = 0;
      for (const m of game.monsters) {
        if (m.dead) continue;
        if (Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y) > 220) continue;
        if (lineBlocked(game.zone, p.pos.x, p.pos.y, m.pos.x, m.pos.y)) continue;
        applyStun(m, 1.2 + r * 0.12);
        n++;
      }
      p.dmgBuff = (10 + r * 4) / 100;
      p.dmgBuffT = 8;
      game.novas.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.6, r: 220, color: '#d8b26a' });
      shake(7);
      if (n) floatText(p.pos.x, p.pos.y - 40, `${n} stunned`, '#d8b26a', 13);
      break;
    }
    default: return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Damage to the player                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {any} game @param {number} raw @param {Monster|{level:number,coldPart?:number}} src
 */
export function damagePlayer(game, raw, src) {
  const p = game.player;
  if (p.dead || p.invuln > 0) return;

  const coldPart = /** @type {any} */ (src).def?.coldPart ?? /** @type {any} */ (src).coldPart ?? 0;
  const physRaw = raw * (1 - coldPart);
  const coldRaw = raw * coldPart;

  const red = armorReduction(p.armor * (1 + (p.armorBuff || 0)), src.level);
  let total = physRaw * (1 - red) + coldRaw * (1 - p.res.cold / 100);
  total *= 1 - (p.dmgReduction || 0);
  total = Math.max(1, Math.round(total));

  // A hit breaks the town portal — that is why it costs two seconds of calm.
  if (p.cast) {
    p.cast = null;
    burst(p.pos.x, p.pos.y - 8, 18, { color: '#7a8ea0', speed: 150, life: 0.5, size: 2.4 });
    game.alert('The portal was broken by the blow.');
  }

  p.hp -= total;
  p.hitFlash = 0.2;
  p.invuln = 0.12;
  floatText(p.pos.x, p.pos.y - 30, `-${total}`, '#ff7a86', 14);
  burst(p.pos.x, p.pos.y, 8, { color: '#a8202a', speed: 130, life: 0.4, size: 2.6 });
  shake(Math.min(9, 2 + total / 8));
  screenFlash(Math.min(0.5, total / p.maxHp * 1.6));

  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.deaths++;
    p.deathT = 1.6;
    burst(p.pos.x, p.pos.y, 70, { color: '#a8202a', speed: 280, life: 1.1, size: 3.4 });
    decal(p.pos.x, p.pos.y, 44, 'rgba(120,20,30,0.55)');
    shake(16);
  }
}

/** Drink a health potion. @param {any} game */
export function drinkPotion(game) {
  const p = game.player;
  if (p.potions <= 0 || p.dead) return false;
  if (p.hp >= p.maxHp) { game.alert('You are unhurt.'); return false; }
  p.potions--;
  const heal = Math.round(p.maxHp * 0.45 + 20);
  p.hp = Math.min(p.maxHp, p.hp + heal);
  floatText(p.pos.x, p.pos.y - 34, `+${heal}`, '#7ce39a', 15);
  burst(p.pos.x, p.pos.y, 16, { color: '#7ce39a', speed: 110, life: 0.6, size: 2.4, grav: -40 });
  return true;
}
