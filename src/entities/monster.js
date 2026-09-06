// @ts-check
import { ELITE_MODS } from '../data/monsters.js';
import { rng } from '../core/rng.js';

/** @typedef {import('../data/monsters.js').MonsterDef} MonsterDef */

let nextId = 1;

/**
 * Skapar ett monster av en arketyp på given nivå.
 * @param {MonsterDef|any} def
 * @param {number} level
 * @param {number} x @param {number} y
 * @param {{elite?:boolean, champion?:boolean, boss?:boolean}} [opts]
 */
export function createMonster(def, level, x, y, opts = {}) {
  const L = Math.max(1, level);
  const m = {
    id: nextId++,
    def, name: def.name, shape: def.shape, ai: def.ai,
    pos: { x, y }, vel: { x: 0, y: 0 }, facing: rng.range(-Math.PI, Math.PI),
    radius: def.radius, level: L,
    maxHp: def.hp + def.hpPerLvl * (L - 1),
    hp: 0,
    dmgMin: (def.dmg + def.dmgPerLvl * (L - 1)) * 0.8,
    dmgMax: (def.dmg + def.dmgPerLvl * (L - 1)) * 1.3,
    armor: def.armor + L * 2.5,
    xp: def.xp * (1 + (L - 1) * 0.42),
    speed: def.speed,
    attackRange: def.attackRange,
    attackCd: def.attackCd,
    /** @type {Record<string, number>} */ res: { ...def.res },

    cd: rng.range(0, def.attackCd),
    windup: 0,
    /** @type {'idle'|'chase'|'attack'|'lunge'} */ state: 'idle',
    lungeT: 0, lungeCd: rng.range(1, 4),
    wanderT: 0, wanderDir: rng.range(-Math.PI, Math.PI),

    slowT: 0, slowAmt: 0, freezeT: 0, stunT: 0,
    /** @type {{t:number, dps:number}|null} */ bleed: null,
    auraSlow: 0, lifeSteal: 0,
    hitFlash: 0, dead: false, corpseT: 0,

    /** @type {null|{mods:import('../data/monsters.js').EliteMod[], color:string}} */ elite: null,
    isChampion: !!opts.champion,
    isBoss: !!opts.boss,
  };

  if (opts.boss) {
    m.title = def.title;
  }
  if (opts.champion) {
    // Champions: tåligare versioner av vanliga monster, ingen egen modifierare.
    m.maxHp *= 2.4; m.dmgMin *= 1.3; m.dmgMax *= 1.3; m.xp *= 3; m.radius *= 1.18;
  }
  if (opts.elite) {
    const mods = rng.shuffle(ELITE_MODS).slice(0, rng.int(1, 2));
    m.maxHp *= 3.6; m.dmgMin *= 1.5; m.dmgMax *= 1.5; m.xp *= 7; m.radius *= 1.3;
    for (const mod of mods) mod.apply(m);
    m.elite = { mods, color: mods[0].color };
  }

  m.hp = m.maxHp;
  return m;
}

/** @typedef {ReturnType<typeof createMonster>} Monster */

/** Namn med elitprefix, för HUD/tooltip. @param {Monster} m */
export function monsterTitle(m) {
  if (m.isBoss) return m.name;
  if (m.elite) return `${m.elite.mods.map(x => x.name).join(' ')} ${m.name.toLowerCase()}`;
  if (m.isChampion) return `Utvald ${m.name.toLowerCase()}`;
  return m.name;
}
