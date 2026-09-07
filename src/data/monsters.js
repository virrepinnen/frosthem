// @ts-check
/**
 * Monster archetypes. Stats scale with monster level so the same archetype can
 * be reused in later zones — exactly how D2 reuses enemies across acts.
 */

/**
 * @typedef {Object} MonsterDef
 * @property {string} id
 * @property {string} name
 * @property {number} radius
 * @property {string} color        Body colour
 * @property {string} color2       Detail colour
 * @property {'wolf'|'humanoid'|'wraith'|'boss'} shape
 * @property {'melee'|'ranged'|'charger'} ai
 * @property {number} speed        px/s at level 1
 * @property {number} hp           Base HP
 * @property {number} hpPerLvl
 * @property {number} dmg          Base damage
 * @property {number} dmgPerLvl
 * @property {number} armor
 * @property {number} xp           Base XP
 * @property {number} attackRange
 * @property {number} attackCd     Seconds
 * @property {Record<string,number>} res
 * @property {[number,number]} pack Min/max in a group
 * @property {number} minZone
 * @property {number} [weight]
 * @property {number} [coldPart] Share of the damage dealt as cold instead of physical
 */

/** @type {MonsterDef[]} */
export const MONSTERS = [
  {
    id: 'wolf', name: 'Snow Wolf', radius: 10, color: '#4e5c70', color2: '#222b38',
    shape: 'wolf', ai: 'charger', speed: 118, hp: 11, hpPerLvl: 5.5, dmg: 3, dmgPerLvl: 1.5,
    armor: 2, xp: 6, attackRange: 26, attackCd: 1.1, res: { cold: 40 }, pack: [6, 10], minZone: 1, weight: 12,
  },
  {
    id: 'ghoul', name: 'Frost Ghoul', radius: 12, color: '#5c7288', color2: '#1d2937',
    shape: 'humanoid', ai: 'melee', speed: 72, hp: 19, hpPerLvl: 10, dmg: 5, dmgPerLvl: 2.4,
    armor: 6, xp: 10, coldPart: 0.2, attackRange: 30, attackCd: 1.5, res: { cold: 55, fire: -25 }, pack: [5, 8], minZone: 1, weight: 10,
  },
  {
    id: 'raider', name: 'Outland Raider', radius: 11, color: '#8a6242', color2: '#2e2016',
    shape: 'humanoid', ai: 'ranged', speed: 88, hp: 18, hpPerLvl: 8, dmg: 6, dmgPerLvl: 2.6,
    armor: 10, xp: 12, attackRange: 250, attackCd: 2.0, res: {}, pack: [3, 6], minZone: 1, weight: 8,
  },
  {
    id: 'revenant', name: 'Ice Wraith', radius: 14, color: '#6fb9d8', color2: '#123448',
    shape: 'wraith', ai: 'melee', speed: 62, hp: 52, hpPerLvl: 18, dmg: 9, dmgPerLvl: 3.4,
    armor: 18, xp: 24, coldPart: 0.45, attackRange: 34, attackCd: 1.8, res: { cold: 75, light: 20, fire: -20 },
    pack: [2, 4], minZone: 2, weight: 7,
  },
  {
    id: 'brute', name: 'Drift Bear', radius: 18, color: '#8f9cb0', color2: '#2b3441',
    shape: 'humanoid', ai: 'charger', speed: 82, hp: 92, hpPerLvl: 28, dmg: 14, dmgPerLvl: 4.6,
    armor: 26, xp: 42, coldPart: 0.15, attackRange: 42, attackCd: 2.2, res: { cold: 50 }, pack: [2, 3], minZone: 3, weight: 5,
  },
];

/** Boss — hand-designed, not scaled out of the table. */
export const BOSS = {
  id: 'hravn', name: 'Jarl Hravn, the Frozen', radius: 34,
  color: '#a8d8ec', color2: '#0e2c40', shape: /** @type {'boss'} */ ('boss'), ai: /** @type {'melee'} */ ('melee'),
  speed: 74, hp: 900, hpPerLvl: 130, dmg: 22, dmgPerLvl: 6, armor: 60, xp: 1400, coldPart: 0.45,
  attackRange: 56, attackCd: 1.6, res: { cold: 70, fire: -15, light: 25 },
  pack: /** @type {[number,number]} */ ([1, 1]), minZone: 3, weight: 0,
  title: 'Warden of Den frusna graven',
};

/**
 * Elite modifiers. Random combinations create unpredictable difficulty spikes
 * without anyone hand-designing them — D2's champion/unique packs.
 * @typedef {Object} EliteMod
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {(m:any)=>void} apply
 */
/** @type {EliteMod[]} */
export const ELITE_MODS = [
  { id: 'fast',    name: 'Swift',       color: '#eadb7a', apply: m => { m.speed *= 1.5; m.attackCd *= 0.75; } },
  { id: 'brutal',  name: 'Brutal',      color: '#e07a6a', apply: m => { m.dmgMin *= 1.7; m.dmgMax *= 1.7; } },
  { id: 'frost',   name: 'Frostbound',  color: '#7fd4f0', apply: m => { m.auraSlow = 0.42; m.res.cold = (m.res.cold || 0) + 40; } },
  { id: 'armored', name: 'Armoured',    color: '#b9c3d2', apply: m => { m.armor *= 2.6; m.maxHp *= 1.5; m.hp = m.maxHp; } },
  { id: 'thirsty', name: 'Bloodthirsty',color: '#c25a6a', apply: m => { m.lifeSteal = 0.45; } },
  { id: 'warded',  name: 'Warded',      color: '#9a7ad0', apply: m => { m.res.fire = (m.res.fire || 0) + 50; m.res.light = (m.res.light || 0) + 50; } },
];
