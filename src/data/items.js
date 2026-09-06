// @ts-check
/**
 * Bastyper och affixtabeller.
 *
 * Modellen är Diablo 2:s: ett föremål = bastyp + sällsynthet + slumpade affixer,
 * där vilka affix-*nivåer* som kan rullas styrs av föremålets ilvl (som i sin tur
 * kommer från monstrets nivå). Det är den mekanik som gör att samma yxa kan vara
 * skräp på nivå 3 och byggdefinierande på nivå 30.
 */

/** @typedef {'weapon'|'shield'|'helm'|'chest'|'gloves'|'boots'|'belt'|'ring'|'amulet'} Slot */
/** @typedef {'normal'|'magic'|'rare'|'unique'} Rarity */
/** @typedef {Record<string, number>} Mods */

/**
 * @typedef {Object} BaseItem
 * @property {string} id
 * @property {string} name
 * @property {Slot} slot
 * @property {number} ilvl        Lägsta zonnivå där den börjar droppa
 * @property {number} value       Basvärde i guld
 * @property {string} icon
 * @property {number} [dmgMin]
 * @property {number} [dmgMax]
 * @property {number} [speed]     Attacker/sek-multiplikator (1 = normal)
 * @property {number} [armor]
 * @property {number} [reqStr]
 * @property {number} [reqDex]
 */

/** @type {BaseItem[]} */
export const BASES = [
  // ---- vapen ----------------------------------------------------------------
  { id: 'rustyaxe',  name: 'Rostig yxa',      slot: 'weapon', ilvl: 1,  dmgMin: 4,  dmgMax: 9,  speed: 1.00, reqStr: 0,  value: 12,  icon: '🪓' },
  { id: 'cudgel',    name: 'Knölpåk',         slot: 'weapon', ilvl: 1,  dmgMin: 5,  dmgMax: 8,  speed: 1.10, reqStr: 0,  value: 10,  icon: '🔨' },
  { id: 'shortsword',name: 'Kortsvärd',       slot: 'weapon', ilvl: 3,  dmgMin: 4,  dmgMax: 10, speed: 1.15, reqDex: 12, value: 26,  icon: '🗡️' },
  { id: 'handaxe',   name: 'Handyxa',         slot: 'weapon', ilvl: 5,  dmgMin: 7,  dmgMax: 12, speed: 0.95, reqStr: 15, value: 32,  icon: '🪓' },
  { id: 'mace',      name: 'Stridsklubba',    slot: 'weapon', ilvl: 8,  dmgMin: 9,  dmgMax: 14, speed: 0.90, reqStr: 22, value: 48,  icon: '🔨' },
  { id: 'longsword', name: 'Långsvärd',       slot: 'weapon', ilvl: 11, dmgMin: 9,  dmgMax: 24, speed: 1.05, reqDex: 24, value: 74,  icon: '⚔️' },
  { id: 'battleaxe', name: 'Stridsyxa',       slot: 'weapon', ilvl: 13, dmgMin: 14, dmgMax: 22, speed: 0.85, reqStr: 34, value: 88,  icon: '🪓' },
  { id: 'morningstar',name:'Morgonstjärna',   slot: 'weapon', ilvl: 16, dmgMin: 17, dmgMax: 26, speed: 0.88, reqStr: 40, value: 110, icon: '🔨' },
  { id: 'greatsword',name: 'Slagsvärd',       slot: 'weapon', ilvl: 20, dmgMin: 18, dmgMax: 42, speed: 0.90, reqStr: 44, reqDex: 30, value: 165, icon: '⚔️' },
  { id: 'warhammer', name: 'Krosshammare',    slot: 'weapon', ilvl: 24, dmgMin: 28, dmgMax: 40, speed: 0.78, reqStr: 58, value: 210, icon: '🔨' },
  { id: 'glaive',    name: 'Bardisan',        slot: 'weapon', ilvl: 27, dmgMin: 24, dmgMax: 50, speed: 0.92, reqStr: 48, reqDex: 40, value: 260, icon: '🗡️' },

  // ---- sköld ----------------------------------------------------------------
  { id: 'buckler',   name: 'Träbuckla',       slot: 'shield', ilvl: 1,  armor: 6,   value: 10,  icon: '🛡️' },
  { id: 'roundshield',name:'Rundsköld',       slot: 'shield', ilvl: 6,  armor: 16,  reqStr: 16, value: 34,  icon: '🛡️' },
  { id: 'ironshield',name: 'Järnsköld',       slot: 'shield', ilvl: 13, armor: 34,  reqStr: 32, value: 78,  icon: '🛡️' },
  { id: 'towershield',name:'Tornsköld',       slot: 'shield', ilvl: 22, armor: 60,  reqStr: 55, value: 170, icon: '🛡️' },

  // ---- hjälm ----------------------------------------------------------------
  { id: 'hood',      name: 'Huva',            slot: 'helm',   ilvl: 1,  armor: 3,   value: 6,   icon: '⛑️' },
  { id: 'leatherhelm',name:'Läderhjälm',      slot: 'helm',   ilvl: 5,  armor: 12,  value: 24,  icon: '⛑️' },
  { id: 'ironhelm',  name: 'Järnhjälm',       slot: 'helm',   ilvl: 12, armor: 26,  reqStr: 24, value: 62,  icon: '⛑️' },
  { id: 'hornhelm',  name: 'Hornhjälm',       slot: 'helm',   ilvl: 21, armor: 46,  reqStr: 44, value: 140, icon: '⛑️' },

  // ---- bröst ----------------------------------------------------------------
  { id: 'rags',      name: 'Trasor',          slot: 'chest',  ilvl: 1,  armor: 5,   value: 5,   icon: '🧥' },
  { id: 'quilted',   name: 'Vadderad rock',   slot: 'chest',  ilvl: 3,  armor: 11,  value: 20,  icon: '🧥' },
  { id: 'leatherarmor',name:'Läderrustning',  slot: 'chest',  ilvl: 7,  armor: 22,  reqStr: 14, value: 46,  icon: '🧥' },
  { id: 'studded',   name: 'Nitläder',        slot: 'chest',  ilvl: 11, armor: 34,  reqStr: 22, value: 72,  icon: '🧥' },
  { id: 'chainmail', name: 'Ringbrynja',      slot: 'chest',  ilvl: 15, armor: 52,  reqStr: 36, value: 118, icon: '🧥' },
  { id: 'scalemail', name: 'Fjällpansar',     slot: 'chest',  ilvl: 20, armor: 70,  reqStr: 48, value: 168, icon: '🧥' },
  { id: 'platearmor',name: 'Plåtrustning',    slot: 'chest',  ilvl: 26, armor: 100, reqStr: 66, value: 250, icon: '🧥' },

  // ---- handskar / stövlar / bälte -------------------------------------------
  { id: 'ragwraps',  name: 'Trasvantar',      slot: 'gloves', ilvl: 1,  armor: 2,   value: 4,   icon: '🧤' },
  { id: 'leathergloves',name:'Läderhandskar', slot: 'gloves', ilvl: 5,  armor: 9,   value: 20,  icon: '🧤' },
  { id: 'chaingloves',name:'Ringvantar',      slot: 'gloves', ilvl: 13, armor: 19,  reqStr: 22, value: 56,  icon: '🧤' },
  { id: 'gauntlets', name: 'Pansarhandskar',  slot: 'gloves', ilvl: 22, armor: 33,  reqStr: 45, value: 130, icon: '🧤' },

  { id: 'footwraps', name: 'Fotlappar',       slot: 'boots',  ilvl: 1,  armor: 2,   value: 4,   icon: '🥾' },
  { id: 'leatherboots',name:'Läderstövlar',   slot: 'boots',  ilvl: 5,  armor: 9,   value: 20,  icon: '🥾' },
  { id: 'chainboots',name: 'Ringstövlar',     slot: 'boots',  ilvl: 13, armor: 19,  reqStr: 22, value: 56,  icon: '🥾' },
  { id: 'plateboots',name: 'Pansarstövlar',   slot: 'boots',  ilvl: 22, armor: 33,  reqStr: 45, value: 130, icon: '🥾' },

  { id: 'ropebelt',  name: 'Repbälte',        slot: 'belt',   ilvl: 1,  armor: 1,   value: 3,   icon: '🪢' },
  { id: 'leatherbelt',name:'Läderbälte',      slot: 'belt',   ilvl: 6,  armor: 7,   value: 18,  icon: '🪢' },
  { id: 'studdedbelt',name:'Nitbälte',        slot: 'belt',   ilvl: 14, armor: 15,  reqStr: 20, value: 50,  icon: '🪢' },
  { id: 'warbelt',   name: 'Krigsbälte',      slot: 'belt',   ilvl: 23, armor: 25,  reqStr: 42, value: 120, icon: '🪢' },

  // ---- smycken (bara affixer) -----------------------------------------------
  { id: 'tinring',   name: 'Tennring',        slot: 'ring',   ilvl: 2,  value: 30,  icon: '💍' },
  { id: 'silverring',name: 'Silverring',      slot: 'ring',   ilvl: 10, value: 90,  icon: '💍' },
  { id: 'goldring',  name: 'Guldring',        slot: 'ring',   ilvl: 20, value: 200, icon: '💍' },
  { id: 'boneamulet',name: 'Benamulett',      slot: 'amulet', ilvl: 3,  value: 40,  icon: '📿' },
  { id: 'silveramulet',name:'Silveramulett',  slot: 'amulet', ilvl: 12, value: 120, icon: '📿' },
  { id: 'runeamulet',name: 'Runamulett',      slot: 'amulet', ilvl: 22, value: 260, icon: '📿' },
];

/** Grupper en affix kan hänga på. */
export const GROUPS = {
  weapon: /** @type {Slot[]} */ (['weapon']),
  armor:  /** @type {Slot[]} */ (['shield', 'helm', 'chest', 'gloves', 'boots', 'belt']),
  jewel:  /** @type {Slot[]} */ (['ring', 'amulet']),
  all:    /** @type {Slot[]} */ (['weapon', 'shield', 'helm', 'chest', 'gloves', 'boots', 'belt', 'ring', 'amulet']),
};

/**
 * @typedef {Object} AffixTier
 * @property {string} label   Namnet som visas i föremålsnamnet på den här nivån
 * @property {number} ilvl    Minsta ilvl för att kunna rullas
 * @property {number} min
 * @property {number} max
 * @property {number} [w]     Vikt (default 10)
 */
/**
 * @typedef {Object} AffixDef
 * @property {string} id
 * @property {'prefix'|'suffix'} kind
 * @property {string} stat
 * @property {Slot[]} slots
 * @property {AffixTier[]} tiers
 * @property {boolean} [float] Rulla decimaltal i stället för heltal
 */

/** Prefix — alltid genitivform, så de fungerar med både en- och ett-ord. */
/** @type {AffixDef[]} */
export const PREFIXES = [
  { id: 'wdmg', kind: 'prefix', stat: 'dmgPct', slots: GROUPS.weapon, tiers: [
    { label: 'Vässarens', ilvl: 1,  min: 10, max: 20 },
    { label: 'Smedens',   ilvl: 7,  min: 21, max: 38 },
    { label: 'Krigarens', ilvl: 14, min: 39, max: 60 },
    { label: 'Bödelns',   ilvl: 22, min: 61, max: 90, w: 6 },
    { label: 'Jättens',   ilvl: 32, min: 91, max: 130, w: 3 },
  ]},
  { id: 'wflat', kind: 'prefix', stat: 'dmgFlat', slots: GROUPS.weapon, tiers: [
    { label: 'Stenens',   ilvl: 1,  min: 1,  max: 2 },
    { label: 'Järnets',   ilvl: 6,  min: 3,  max: 6 },
    { label: 'Malmens',   ilvl: 14, min: 7,  max: 12 },
    { label: 'Bergets',   ilvl: 24, min: 13, max: 20, w: 6 },
  ]},
  { id: 'aspd', kind: 'prefix', stat: 'attackSpeed', slots: GROUPS.weapon, tiers: [
    { label: 'Ilskans',   ilvl: 4,  min: 8,  max: 12 },
    { label: 'Vredens',   ilvl: 12, min: 13, max: 19 },
    { label: 'Furiens',   ilvl: 22, min: 20, max: 27, w: 5 },
  ]},
  { id: 'cold', kind: 'prefix', stat: 'coldDmg', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'Rimfrostens', ilvl: 3,  min: 2,  max: 5 },
    { label: 'Isens',       ilvl: 10, min: 6,  max: 13 },
    { label: 'Snöstormens', ilvl: 19, min: 14, max: 26 },
    { label: 'Vinterns',    ilvl: 29, min: 27, max: 46, w: 5 },
  ]},
  { id: 'fire', kind: 'prefix', stat: 'fireDmg', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'Glödens',   ilvl: 3,  min: 2,  max: 6 },
    { label: 'Eldens',    ilvl: 11, min: 7,  max: 15 },
    { label: 'Brasans',   ilvl: 21, min: 16, max: 30 },
  ]},
  { id: 'light', kind: 'prefix', stat: 'lightDmg', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'Gnistans',  ilvl: 5,  min: 1,  max: 9 },
    { label: 'Åskans',    ilvl: 14, min: 2,  max: 20 },
    { label: 'Ovädrets',  ilvl: 26, min: 4,  max: 38 },
  ]},
  { id: 'apct', kind: 'prefix', stat: 'armorPct', slots: GROUPS.armor, tiers: [
    { label: 'Lädrets',     ilvl: 1,  min: 10, max: 22 },
    { label: 'Ringens',     ilvl: 8,  min: 23, max: 45 },
    { label: 'Plåtens',     ilvl: 16, min: 46, max: 75 },
    { label: 'Fästningens', ilvl: 26, min: 76, max: 115, w: 6 },
  ]},
  { id: 'life', kind: 'prefix', stat: 'life', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'Livets',          ilvl: 1,  min: 5,  max: 11 },
    { label: 'Hjärtats',        ilvl: 8,  min: 12, max: 24 },
    { label: 'Själens',         ilvl: 17, min: 25, max: 42 },
    { label: 'Odödlighetens',   ilvl: 27, min: 43, max: 72, w: 5 },
  ]},
];

/** Suffix — "av X". */
/** @type {AffixDef[]} */
export const SUFFIXES = [
  { id: 'str', kind: 'suffix', stat: 'str', slots: GROUPS.all, tiers: [
    { label: 'av björnen', ilvl: 1, min: 1, max: 3 },
    { label: 'av björnen', ilvl: 10, min: 4, max: 8 },
    { label: 'av björnen', ilvl: 20, min: 9, max: 15 },
  ]},
  { id: 'dex', kind: 'suffix', stat: 'dex', slots: GROUPS.all, tiers: [
    { label: 'av räven', ilvl: 1, min: 1, max: 3 },
    { label: 'av räven', ilvl: 10, min: 4, max: 8 },
    { label: 'av räven', ilvl: 20, min: 9, max: 15 },
  ]},
  { id: 'vit', kind: 'suffix', stat: 'vit', slots: GROUPS.all, tiers: [
    { label: 'av oxen', ilvl: 1, min: 1, max: 3 },
    { label: 'av oxen', ilvl: 10, min: 4, max: 8 },
    { label: 'av oxen', ilvl: 20, min: 9, max: 15 },
  ]},
  { id: 'will', kind: 'suffix', stat: 'will', slots: GROUPS.all, tiers: [
    { label: 'av ugglan', ilvl: 1, min: 1, max: 3 },
    { label: 'av ugglan', ilvl: 10, min: 4, max: 8 },
    { label: 'av ugglan', ilvl: 20, min: 9, max: 15 },
  ]},
  { id: 'armorflat', kind: 'suffix', stat: 'armor', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'av skölden', ilvl: 1,  min: 3,  max: 9 },
    { label: 'av skölden', ilvl: 10, min: 10, max: 22 },
    { label: 'av skölden', ilvl: 20, min: 23, max: 44 },
  ]},
  { id: 'rescold', kind: 'suffix', stat: 'resCold', slots: GROUPS.all, tiers: [
    { label: 'av frosten', ilvl: 1,  min: 6,  max: 13 },
    { label: 'av frosten', ilvl: 12, min: 14, max: 26 },
    { label: 'av frosten', ilvl: 24, min: 27, max: 42 },
  ]},
  { id: 'resfire', kind: 'suffix', stat: 'resFire', slots: GROUPS.all, tiers: [
    { label: 'av lågan', ilvl: 1,  min: 6,  max: 13 },
    { label: 'av lågan', ilvl: 12, min: 14, max: 26 },
    { label: 'av lågan', ilvl: 24, min: 27, max: 42 },
  ]},
  { id: 'reslight', kind: 'suffix', stat: 'resLight', slots: GROUPS.all, tiers: [
    { label: 'av stormen', ilvl: 1,  min: 6,  max: 13 },
    { label: 'av stormen', ilvl: 12, min: 14, max: 26 },
    { label: 'av stormen', ilvl: 24, min: 27, max: 42 },
  ]},
  { id: 'resall', kind: 'suffix', stat: 'resAll', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'av bevarandet', ilvl: 15, min: 5,  max: 11, w: 6 },
    { label: 'av bevarandet', ilvl: 28, min: 12, max: 20, w: 3 },
  ]},
  { id: 'ms', kind: 'suffix', stat: 'moveSpeed', slots: ['boots', 'ring', 'amulet'], tiers: [
    { label: 'av vinden', ilvl: 4,  min: 5,  max: 9 },
    { label: 'av vinden', ilvl: 15, min: 10, max: 16 },
  ]},
  { id: 'crit', kind: 'suffix', stat: 'critChance', slots: [...GROUPS.weapon, ...GROUPS.jewel, 'gloves'], tiers: [
    { label: 'av jägaren', ilvl: 6,  min: 2, max: 5 },
    { label: 'av jägaren', ilvl: 18, min: 6, max: 11 },
  ]},
  { id: 'critmult', kind: 'suffix', stat: 'critMult', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'av mordet', ilvl: 10, min: 15, max: 32 },
    { label: 'av mordet', ilvl: 24, min: 33, max: 58, w: 6 },
  ]},
  { id: 'leech', kind: 'suffix', stat: 'lifeSteal', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'av vargen', ilvl: 12, min: 2, max: 4, w: 7 },
    { label: 'av vargen', ilvl: 24, min: 5, max: 8, w: 4 },
  ]},
  { id: 'regen', kind: 'suffix', stat: 'lifeRegen', slots: [...GROUPS.armor, ...GROUPS.jewel], float: true, tiers: [
    { label: 'av härden', ilvl: 2,  min: 0.4, max: 1.2 },
    { label: 'av härden', ilvl: 14, min: 1.3, max: 3.0 },
  ]},
  { id: 'sta', kind: 'suffix', stat: 'stamina', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'av uthålligheten', ilvl: 1,  min: 4,  max: 10 },
    { label: 'av uthålligheten', ilvl: 13, min: 11, max: 22 },
  ]},
  { id: 'mf', kind: 'suffix', stat: 'magicFind', slots: [...GROUPS.jewel, 'helm', 'boots'], tiers: [
    { label: 'av skatten', ilvl: 4,  min: 6,  max: 16 },
    { label: 'av skatten', ilvl: 16, min: 17, max: 34, w: 6 },
  ]},
];

/**
 * Unika föremål — fasta, minnesvärda, och sällsynta. Det här är de droppar som
 * får en spelare att skrika. Håll dem få och tydligt särpräglade.
 * @typedef {Object} UniqueDef
 * @property {string} id
 * @property {string} name
 * @property {string} base    BaseItem-id
 * @property {number} ilvl
 * @property {Mods} mods
 * @property {string} flavor
 */
/** @type {UniqueDef[]} */
export const UNIQUES = [
  { id: 'wolfbite', name: 'Vargbett', base: 'handaxe', ilvl: 5, flavor: '"Den bet först. Den bet sist."',
    mods: { dmgPct: 55, attackSpeed: 15, lifeSteal: 4, moveSpeed: 8, dex: 6 } },
  { id: 'wintertongue', name: 'Vinterns Tunga', base: 'longsword', ilvl: 12, flavor: '"Stål som andas ut i stället för in."',
    mods: { dmgPct: 60, coldDmg: 22, freezeChance: 18, resCold: 20 } },
  { id: 'jarlsburden', name: 'Jarlens Börda', base: 'chainmail', ilvl: 16, flavor: '"Han bar den tills marken gav vika."',
    mods: { armorPct: 90, life: 45, resAll: 12, moveSpeed: -10, str: 10 } },
  { id: 'lasthearth', name: 'Sista Härden', base: 'silveramulet', ilvl: 13, flavor: '"Så länge en glöd finns kvar."',
    mods: { resAll: 16, lifeRegen: 3.5, life: 30, resFire: 15 } },
  { id: 'iceeye', name: 'Isöga', base: 'silverring', ilvl: 11, flavor: '"Det ser vad snön har begravt."',
    mods: { coldDmg: 14, resCold: 28, magicFind: 25, will: 6 } },
  { id: 'stormstride', name: 'Stormsteg', base: 'chainboots', ilvl: 14, flavor: '"Ingen driva höll honom."',
    mods: { moveSpeed: 22, armorPct: 40, resLight: 22, stamina: 20 } },
];

/** Läsbara namn + formattering för varje stat. */
export const STAT_INFO = /** @type {Record<string,{label:string, fmt:(v:number)=>string, order:number}>} */ ({
  dmgPct:      { label: 'Vapenskada',        fmt: v => `+${v}%`,        order: 1 },
  dmgFlat:     { label: 'Skada',             fmt: v => `+${v}`,         order: 2 },
  attackSpeed: { label: 'Attackhastighet',   fmt: v => `+${v}%`,        order: 3 },
  critChance:  { label: 'Kritisk träff',     fmt: v => `+${v}%`,        order: 4 },
  critMult:    { label: 'Kritisk skada',     fmt: v => `+${v}%`,        order: 5 },
  coldDmg:     { label: 'Köldskada',         fmt: v => `+${v}`,         order: 6 },
  fireDmg:     { label: 'Eldskada',          fmt: v => `+${v}`,         order: 7 },
  lightDmg:    { label: 'Blixtskada',        fmt: v => `+${v}`,         order: 8 },
  freezeChance:{ label: 'Chans att frysa',   fmt: v => `+${v}%`,        order: 9 },
  lifeSteal:   { label: 'Livsdräneri',       fmt: v => `+${v}%`,        order: 10 },
  armorPct:    { label: 'Rustning',          fmt: v => `+${v}%`,        order: 11 },
  armor:       { label: 'Rustning',          fmt: v => `+${v}`,         order: 12 },
  life:        { label: 'Liv',               fmt: v => `+${v}`,         order: 13 },
  lifeRegen:   { label: 'Livsåterhämtning',  fmt: v => `+${v.toFixed(1)}/s`, order: 14 },
  stamina:     { label: 'Uthållighet',       fmt: v => `+${v}`,         order: 15 },
  moveSpeed:   { label: 'Gånghastighet',     fmt: v => `${v >= 0 ? '+' : ''}${v}%`, order: 16 },
  str:         { label: 'Styrka',            fmt: v => `+${v}`,         order: 17 },
  dex:         { label: 'Smidighet',         fmt: v => `+${v}`,         order: 18 },
  vit:         { label: 'Vitalitet',         fmt: v => `+${v}`,         order: 19 },
  will:        { label: 'Vilja',             fmt: v => `+${v}`,         order: 20 },
  resCold:     { label: 'Köldmotstånd',      fmt: v => `+${v}%`,        order: 21 },
  resFire:     { label: 'Eldmotstånd',       fmt: v => `+${v}%`,        order: 22 },
  resLight:    { label: 'Blixtmotstånd',     fmt: v => `+${v}%`,        order: 23 },
  resAll:      { label: 'Alla motstånd',     fmt: v => `+${v}%`,        order: 24 },
  magicFind:   { label: 'Bättre fynd',       fmt: v => `+${v}%`,        order: 25 },
});

export const RARITY_COLOR = /** @type {Record<Rarity,string>} */ ({
  normal: '#cfdcec', magic: '#6f9ffb', rare: '#e8d15a', unique: '#c08a3e',
});

/** Namnfragment för rare-föremål (två ord, som i D2). */
export const RARE_WORDS_A = ['Blod', 'Frost', 'Skugg', 'Storm', 'Ben', 'Järn', 'Varg', 'Grav', 'Sorg', 'Malm', 'Rim', 'Ask', 'Drott', 'Vidd'];
export const RARE_WORDS_B = ['bett', 'sång', 'skärva', 'ed', 'börda', 'tand', 'klo', 'vakt', 'viska', 'brand', 'fall', 'värn', 'törst', 'sten'];
