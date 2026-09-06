// @ts-check
/**
 * Monsterarketyper. Statistik skalar med monsternivå så att samma arketyp kan
 * återanvändas i senare zoner — precis som D2 återanvänder fiender över akter.
 */

/**
 * @typedef {Object} MonsterDef
 * @property {string} id
 * @property {string} name
 * @property {number} radius
 * @property {string} color        Kroppsfärg
 * @property {string} color2       Detaljfärg
 * @property {'wolf'|'humanoid'|'wraith'|'boss'} shape
 * @property {'melee'|'ranged'|'charger'} ai
 * @property {number} speed        px/s vid nivå 1
 * @property {number} hp           Bas-HP
 * @property {number} hpPerLvl
 * @property {number} dmg          Basskada
 * @property {number} dmgPerLvl
 * @property {number} armor
 * @property {number} xp           Bas-XP
 * @property {number} attackRange
 * @property {number} attackCd     Sekunder
 * @property {Record<string,number>} res
 * @property {[number,number]} pack Min/max i en grupp
 * @property {number} minZone
 * @property {number} [weight]
 * @property {number} [coldPart] Andel av skadan som är köld i stället för fysisk
 */

/** @type {MonsterDef[]} */
export const MONSTERS = [
  {
    id: 'wolf', name: 'Snövarg', radius: 13, color: '#4e5c70', color2: '#222b38',
    shape: 'wolf', ai: 'charger', speed: 118, hp: 13, hpPerLvl: 6.5, dmg: 3, dmgPerLvl: 1.5,
    armor: 2, xp: 6, attackRange: 26, attackCd: 1.1, res: { cold: 40 }, pack: [4, 7], minZone: 1, weight: 12,
  },
  {
    id: 'ghoul', name: 'Frostgast', radius: 15, color: '#5c7288', color2: '#1d2937',
    shape: 'humanoid', ai: 'melee', speed: 72, hp: 22, hpPerLvl: 12, dmg: 5, dmgPerLvl: 2.4,
    armor: 6, xp: 10, coldPart: 0.2, attackRange: 30, attackCd: 1.5, res: { cold: 55, fire: -25 }, pack: [3, 5], minZone: 1, weight: 10,
  },
  {
    id: 'raider', name: 'Utbygdsplundrare', radius: 14, color: '#8a6242', color2: '#2e2016',
    shape: 'humanoid', ai: 'ranged', speed: 88, hp: 21, hpPerLvl: 9.5, dmg: 6, dmgPerLvl: 2.6,
    armor: 10, xp: 12, attackRange: 250, attackCd: 2.0, res: {}, pack: [2, 4], minZone: 1, weight: 8,
  },
  {
    id: 'revenant', name: 'Isvålnad', radius: 17, color: '#6fb9d8', color2: '#123448',
    shape: 'wraith', ai: 'melee', speed: 62, hp: 62, hpPerLvl: 22, dmg: 9, dmgPerLvl: 3.4,
    armor: 18, xp: 24, coldPart: 0.45, attackRange: 34, attackCd: 1.8, res: { cold: 75, light: 20, fire: -20 },
    pack: [1, 3], minZone: 2, weight: 7,
  },
  {
    id: 'brute', name: 'Drivbjörn', radius: 22, color: '#8f9cb0', color2: '#2b3441',
    shape: 'humanoid', ai: 'charger', speed: 82, hp: 110, hpPerLvl: 34, dmg: 14, dmgPerLvl: 4.6,
    armor: 26, xp: 42, coldPart: 0.15, attackRange: 42, attackCd: 2.2, res: { cold: 50 }, pack: [1, 2], minZone: 3, weight: 5,
  },
];

/** Boss — handdesignad, inte skalad ur tabellen. */
export const BOSS = {
  id: 'hravn', name: 'Jarl Hravn, den Frusna', radius: 34,
  color: '#a8d8ec', color2: '#0e2c40', shape: /** @type {'boss'} */ ('boss'), ai: /** @type {'melee'} */ ('melee'),
  speed: 74, hp: 900, hpPerLvl: 130, dmg: 22, dmgPerLvl: 6, armor: 60, xp: 1400, coldPart: 0.45,
  attackRange: 56, attackCd: 1.6, res: { cold: 70, fire: -15, light: 25 },
  pack: /** @type {[number,number]} */ ([1, 1]), minZone: 3, weight: 0,
  title: 'Härskaren över Den frusna graven',
};

/**
 * Elit-modifierare. Slumpade kombinationer skapar oförutsägbara svårighetsspikar
 * utan att någon behöver handdesigna dem — D2:s champion/unique-packs.
 * @typedef {Object} EliteMod
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {(m:any)=>void} apply
 */
/** @type {EliteMod[]} */
export const ELITE_MODS = [
  { id: 'fast',    name: 'Snabb',       color: '#eadb7a', apply: m => { m.speed *= 1.5; m.attackCd *= 0.75; } },
  { id: 'brutal',  name: 'Kraftfull',   color: '#e07a6a', apply: m => { m.dmgMin *= 1.7; m.dmgMax *= 1.7; } },
  { id: 'frost',   name: 'Frostbunden', color: '#7fd4f0', apply: m => { m.auraSlow = 0.42; m.res.cold = (m.res.cold || 0) + 40; } },
  { id: 'armored', name: 'Pansrad',     color: '#b9c3d2', apply: m => { m.armor *= 2.6; m.maxHp *= 1.5; m.hp = m.maxHp; } },
  { id: 'thirsty', name: 'Blodtörstig', color: '#c25a6a', apply: m => { m.lifeSteal = 0.45; } },
  { id: 'warded',  name: 'Skyddad',     color: '#9a7ad0', apply: m => { m.res.fire = (m.res.fire || 0) + 50; m.res.light = (m.res.light || 0) + 50; } },
];
