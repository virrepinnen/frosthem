// @ts-check
import { rng } from '../core/rng.js';
import { angleDiff, clamp } from '../core/math.js';
import { armorReduction, skillPower, rank, KILL_STAMINA } from './stats.js';
import { rollItem } from './loot.js';
import { burst, floatText, decal, shake, screenFlash } from '../render/fx.js';
import { lineBlocked } from './world.js';
import { pickAttack } from '../render/hero.js';
import { spawnXpOrbs } from './orbs.js';

/** @typedef {import('../entities/monster.js').Monster} Monster */
/** @typedef {import('../entities/player.js').Player} Player */

const COLD = '#8fd8f4', FIRE = '#f5a04a', LIGHT = '#d7c2ff', CRIT = '#ffd166', PHYS = '#f0f4fa';

/* ------------------------------------------------------------------ */
/* Statuseffekter                                                      */
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
/* Skada mot monster                                                   */
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

  // livsdräneri från spelaren
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
  // Ett fällt byte ger andrum. Det gör flockrensning hållbar samtidigt som
  // bomsvep straffas — precis den avvägning uthålligheten ska skapa.
  game.player.stamina = Math.min(game.player.maxStamina, game.player.stamina + KILL_STAMINA);

  decal(m.pos.x, m.pos.y, m.radius * (m.isBoss ? 3.2 : 1.5), 'rgba(120,20,30,0.5)');
  burst(m.pos.x, m.pos.y, m.isBoss ? 90 : 18, { color: '#a8202a', speed: m.isBoss ? 320 : 190, life: 0.75, size: 3.2 });
  burst(m.pos.x, m.pos.y, 12, { color: '#e8f0fa', speed: 120, life: 0.9, size: 2, grav: -20 });
  if (m.isBoss) { shake(18); screenFlash(0.4, '#7fd4f0'); }
  else if (m.elite) shake(6);

  const xpGain = m.xp * (1 + (game.player.xpBuff || 0));
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

  // Droppfrekvensen är medvetet låg. Med automatisk upplockning blir varje
  // föremål annars bara brus i väskan — sällsyntheten är hela poängen.
  let itemRolls = 0, boost = 1;
  if (m.isBoss) { itemRolls = 4; boost = 4; }
  else if (m.elite) { itemRolls = rng.chance(0.5) ? 2 : 1; boost = 2.8; }
  else if (m.isChampion) { itemRolls = rng.chance(0.35) ? 1 : 0; boost = 2; }
  else if (rng.chance(0.045)) itemRolls = 1;

  for (let i = 0; i < itemRolls; i++) {
    const forced = m.isBoss && i === 0 ? /** @type {const} */ ('rare') : undefined;
    const item = rollItem(ilvl, { mf, boost, forceRarity: forced });
    if (!item) continue;
    // Vitt skräp faller mest bort helt i stället för att skräpa ner marken.
    if (item.rarity === 'normal' && !m.isBoss && rng.chance(0.85)) continue;
    spawnGround(game, m.pos.x, m.pos.y, { kind: 'item', item });
  }

  // Färre men tyngre högar: marken blev plottrig av guld efter varje flock.
  const goldChance = m.isBoss ? 1 : m.elite ? 1 : m.isChampion ? 0.5 : 0.2;
  if (rng.chance(goldChance)) {
    const base = 4 + m.level * 3.2;
    const amount = Math.round(base * rng.range(0.6, 1.8) * (m.isBoss ? 14 : m.elite ? 5 : m.isChampion ? 2.4 : 3.2));
    spawnGround(game, m.pos.x, m.pos.y, { kind: 'gold', amount });
  }
  if (rng.chance(m.isBoss ? 1 : m.elite ? 0.5 : 0.07)) {
    spawnGround(game, m.pos.x, m.pos.y, { kind: 'potion', amount: m.isBoss ? 5 : 1 });
  }
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
/* Spelarens attacker                                                  */
/* ------------------------------------------------------------------ */

/**
 * Löser ett svep: allt inom bågen och räckvidden träffas direkt.
 * Omedelbar träffdetektion (ingen windup) gör att attacken känns responsiv,
 * medan animationen spelar upp efteråt.
 * @param {any} game
 * @param {{arc:number, reach:number, mult:number, kind:string, cold?:number, freeze?:number,
 *          bleed?:{dps:number,dur:number}, stun?:number, ignoreArmor?:boolean,
 *          dir?:number, knock?:number}} o
 */
export function performSwing(game, o) {
  const p = game.player;
  const dir = o.dir ?? p.facing;
  let hits = 0;

  for (const m of game.monsters) {
    if (m.dead) continue;
    const dx = m.pos.x - p.pos.x, dy = m.pos.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > o.reach + m.radius) continue;
    if (o.arc < Math.PI * 1.99 && angleDiff(Math.atan2(dy, dx), dir) > o.arc / 2) continue;
    // Ingen skada genom klippväggar — det gick att döda hela stenbrottet utifrån.
    if (lineBlocked(game.zone, p.pos.x, p.pos.y, m.pos.x, m.pos.y)) continue;

    const roll = rng.range(p.dmgMin, p.dmgMax) * o.mult * (1 + p.dmgBuff + (p.shrineDmg || 0));
    const crit = rng.chance(p.critChance / 100);
    const phys = crit ? roll * (p.critMult / 100) : roll;
    const elemScale = 0.5 + 0.5 * o.mult;

    hitMonster(game, m, {
      phys,
      cold: (p.coldDmg + (o.cold ?? 0)) * elemScale,
      fire: p.fireDmg * elemScale,
      light: p.lightDmg * elemScale,
      crit, ignoreArmor: o.ignoreArmor,
    });

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

  // Varianten avgör både hur slaget ser ut och hur länge animationen tar.
  // Tyngre hugg får mer tid — de ska kännas i handen, inte bara i siffrorna.
  const variant = o.kind === 'whirl' ? null : pickAttack(p, o.kind);
  const stretch = variant === 'overhead' ? 1.5 : variant === 'thrust' ? 1.2 : 1;
  p.swing = {
    t: 0, dur: Math.max(0.16, 0.3 / p.attackSpeed) * stretch,
    dir, arc: o.arc, reach: o.reach, kind: o.kind, variant,
  };
  if (hits) shake(o.kind === 'basic' ? 1.6 : 3.4);
  return hits;
}

/**
 * Utför en skill. Returnerar false om den inte kunde användas.
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
  // Varje skill drar sin egen resurs: Frost kostar mana, resten uthållighet.
  if (def.mana && p.mana < def.mana) { game.alert('För lite mana.'); p.manaFlash = 0.45; return false; }
  if (def.stamina && p.stamina < def.stamina) { game.alert('För lite uthållighet.'); p.staminaFlash = 0.45; return false; }

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
      if (n) floatText(p.pos.x, p.pos.y - 40, `${n} bedövade`, '#d8b26a', 13);
      break;
    }
    default: return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Skada mot spelaren                                                  */
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

  // En träff bryter stadsportalen — det är därför den kostar två sekunders lugn.
  if (p.cast) {
    p.cast = null;
    burst(p.pos.x, p.pos.y - 8, 18, { color: '#7a8ea0', speed: 150, life: 0.5, size: 2.4 });
    game.alert('Portalen bröts av träffen.');
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

/** Använd hälsodryck. @param {any} game */
export function drinkPotion(game) {
  const p = game.player;
  if (p.potions <= 0 || p.dead) return false;
  if (p.hp >= p.maxHp) { game.alert('Du är oskadd.'); return false; }
  p.potions--;
  const heal = Math.round(p.maxHp * 0.45 + 20);
  p.hp = Math.min(p.maxHp, p.hp + heal);
  floatText(p.pos.x, p.pos.y - 34, `+${heal}`, '#7ce39a', 15);
  burst(p.pos.x, p.pos.y, 16, { color: '#7ce39a', speed: 110, life: 0.6, size: 2.4, grav: -40 });
  return true;
}
