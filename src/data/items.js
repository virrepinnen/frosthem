// @ts-check
/**
 * Base types and affix tables.
 *
 * The model is Diablo 2's: an item = base type + rarity + rolled affixes, where
 * which affix *tiers* can roll is governed by the item's ilvl (which in turn
 * comes from the monster's level). That is the mechanic that lets the same axe
 * be junk at level 3 and build-defining at level 30.
 */

/** @typedef {'weapon'|'shield'|'helm'|'chest'|'gloves'|'boots'|'belt'|'ring'|'amulet'} Slot */
/** @typedef {'normal'|'magic'|'rare'|'unique'} Rarity */
/** @typedef {Record<string, number>} Mods */

/**
 * @typedef {Object} BaseItem
 * @property {string} id
 * @property {string} name
 * @property {Slot} slot
 * @property {number} ilvl        Lowest zone level where it starts dropping
 * @property {number} value       Base value in gold
 * @property {string} kind    Which glyph draws it, see ui/glyphs.js
 * @property {[number,number]} [size] Bag footprint, overrides the slot default
 * @property {number} [dmgMin]
 * @property {number} [dmgMax]
 * @property {number} [speed]     Attacks/sec multiplier (1 = normal)
 * @property {number} [armor]
 */

/** @type {BaseItem[]} */
export const BASES = [
  // ---- weapons --------------------------------------------------------------
  { id: 'rustyaxe',  name: 'Rusty Axe',       slot: 'weapon', ilvl: 1,  dmgMin: 4,  dmgMax: 9,  speed: 1.00,  value: 12,  kind: 'axe', size: [2, 3] },
  { id: 'cudgel',    name: 'Cudgel',          slot: 'weapon', ilvl: 1,  dmgMin: 5,  dmgMax: 8,  speed: 1.10,  value: 10,  kind: 'hammer', size: [1, 3] },
  { id: 'shortsword',name: 'Short Sword',     slot: 'weapon', ilvl: 3,  dmgMin: 4,  dmgMax: 10, speed: 1.15, value: 26,  kind: 'sword', size: [1, 2] },
  { id: 'handaxe',   name: 'Hand Axe',        slot: 'weapon', ilvl: 5,  dmgMin: 7,  dmgMax: 12, speed: 0.95, value: 32,  kind: 'axe', size: [2, 3] },
  { id: 'mace',      name: 'Mace',            slot: 'weapon', ilvl: 8,  dmgMin: 9,  dmgMax: 14, speed: 0.90, value: 48,  kind: 'hammer', size: [1, 3] },
  { id: 'longsword', name: 'Long Sword',      slot: 'weapon', ilvl: 11, dmgMin: 9,  dmgMax: 24, speed: 1.05, value: 74,  kind: 'sword', size: [1, 3] },
  { id: 'battleaxe', name: 'Battle Axe',      slot: 'weapon', ilvl: 13, dmgMin: 14, dmgMax: 22, speed: 0.85, value: 88,  kind: 'axe', size: [2, 3] },
  { id: 'morningstar',name:'Morning Star',    slot: 'weapon', ilvl: 16, dmgMin: 17, dmgMax: 26, speed: 0.88, value: 110, kind: 'hammer', size: [2, 3] },
  { id: 'greatsword',name: 'Great Sword',     slot: 'weapon', ilvl: 20, dmgMin: 18, dmgMax: 42, speed: 0.90, value: 165, kind: 'sword', size: [1, 4] },
  { id: 'warhammer', name: 'War Hammer',      slot: 'weapon', ilvl: 24, dmgMin: 28, dmgMax: 40, speed: 0.78, value: 210, kind: 'hammer', size: [2, 4] },
  { id: 'glaive',    name: 'Glaive',          slot: 'weapon', ilvl: 27, dmgMin: 24, dmgMax: 50, speed: 0.92, value: 260, kind: 'polearm', size: [1, 4] },

  // ---- shields --------------------------------------------------------------
  { id: 'buckler',   name: 'Wooden Buckler',  slot: 'shield', ilvl: 1,  armor: 6,   value: 10,  kind: 'shield', size: [2, 2] },
  { id: 'roundshield',name:'Round Shield',    slot: 'shield', ilvl: 6,  armor: 16, value: 34,  kind: 'shield', size: [2, 2] },
  { id: 'ironshield',name: 'Iron Shield',     slot: 'shield', ilvl: 13, armor: 34, value: 78,  kind: 'shield', size: [2, 3] },
  { id: 'towershield',name:'Tower Shield',    slot: 'shield', ilvl: 22, armor: 60, value: 170, kind: 'shield', size: [2, 3] },

  // ---- helms ----------------------------------------------------------------
  { id: 'hood',      name: 'Hood',            slot: 'helm',   ilvl: 1,  armor: 3,   value: 6,   kind: 'helm', size: [2, 1] },
  { id: 'leatherhelm',name:'Leather Helm',    slot: 'helm',   ilvl: 5,  armor: 12,  value: 24,  kind: 'helm', size: [2, 2] },
  { id: 'ironhelm',  name: 'Iron Helm',       slot: 'helm',   ilvl: 12, armor: 26, value: 62,  kind: 'helm', size: [2, 2] },
  { id: 'hornhelm',  name: 'Horned Helm',     slot: 'helm',   ilvl: 21, armor: 46, value: 140, kind: 'helm', size: [2, 2] },

  // ---- chest ----------------------------------------------------------------
  { id: 'rags',      name: 'Rags',            slot: 'chest',  ilvl: 1,  armor: 5,   value: 5,   kind: 'chest', size: [2, 2] },
  { id: 'quilted',   name: 'Quilted Coat',    slot: 'chest',  ilvl: 3,  armor: 11,  value: 20,  kind: 'chest', size: [2, 3] },
  { id: 'leatherarmor',name:'Leather Armour', slot: 'chest',  ilvl: 7,  armor: 22, value: 46,  kind: 'chest', size: [2, 3] },
  { id: 'studded',   name: 'Studded Leather', slot: 'chest',  ilvl: 11, armor: 34, value: 72,  kind: 'chest', size: [2, 3] },
  { id: 'chainmail', name: 'Chain Mail',      slot: 'chest',  ilvl: 15, armor: 52, value: 118, kind: 'chest', size: [2, 3] },
  { id: 'scalemail', name: 'Scale Mail',      slot: 'chest',  ilvl: 20, armor: 70, value: 168, kind: 'chest', size: [2, 3] },
  { id: 'platearmor',name: 'Plate Armour',    slot: 'chest',  ilvl: 26, armor: 100, value: 250, kind: 'chest', size: [2, 3] },

  // ---- gloves / boots / belts -----------------------------------------------
  { id: 'ragwraps',  name: 'Rag Wraps',       slot: 'gloves', ilvl: 1,  armor: 2,   value: 4,   kind: 'gloves', size: [2, 1] },
  { id: 'leathergloves',name:'Leather Gloves',slot: 'gloves', ilvl: 5,  armor: 9,   value: 20,  kind: 'gloves', size: [2, 2] },
  { id: 'chaingloves',name:'Chain Gloves',    slot: 'gloves', ilvl: 13, armor: 19, value: 56,  kind: 'gloves', size: [2, 2] },
  { id: 'gauntlets', name: 'Gauntlets',       slot: 'gloves', ilvl: 22, armor: 33, value: 130, kind: 'gloves', size: [2, 2] },

  { id: 'footwraps', name: 'Foot Wraps',      slot: 'boots',  ilvl: 1,  armor: 2,   value: 4,   kind: 'boots', size: [2, 1] },
  { id: 'leatherboots',name:'Leather Boots',  slot: 'boots',  ilvl: 5,  armor: 9,   value: 20,  kind: 'boots', size: [2, 2] },
  { id: 'chainboots',name: 'Chain Boots',     slot: 'boots',  ilvl: 13, armor: 19, value: 56,  kind: 'boots', size: [2, 2] },
  { id: 'plateboots',name: 'Plate Boots',     slot: 'boots',  ilvl: 22, armor: 33, value: 130, kind: 'boots', size: [2, 2] },

  { id: 'ropebelt',  name: 'Rope Belt',       slot: 'belt',   ilvl: 1,  armor: 1,   value: 3,   kind: 'belt', size: [2, 1] },
  { id: 'leatherbelt',name:'Leather Belt',    slot: 'belt',   ilvl: 6,  armor: 7,   value: 18,  kind: 'belt', size: [2, 1] },
  { id: 'studdedbelt',name:'Studded Belt',    slot: 'belt',   ilvl: 14, armor: 15, value: 50,  kind: 'belt', size: [2, 1] },
  { id: 'warbelt',   name: 'War Belt',        slot: 'belt',   ilvl: 23, armor: 25, value: 120, kind: 'belt', size: [2, 2] },

  // ---- jewellery (affixes only) ---------------------------------------------
  { id: 'tinring',   name: 'Tin Ring',        slot: 'ring',   ilvl: 2,  value: 30,  kind: 'ring', size: [1, 1] },
  { id: 'silverring',name: 'Silver Ring',     slot: 'ring',   ilvl: 10, value: 90,  kind: 'ring', size: [1, 1] },
  { id: 'goldring',  name: 'Gold Ring',       slot: 'ring',   ilvl: 20, value: 200, kind: 'ring', size: [1, 1] },
  { id: 'boneamulet',name: 'Bone Amulet',     slot: 'amulet', ilvl: 3,  value: 40,  kind: 'amulet', size: [1, 1] },
  { id: 'silveramulet',name:'Silver Amulet',  slot: 'amulet', ilvl: 12, value: 120, kind: 'amulet', size: [1, 1] },
  { id: 'runeamulet',name: 'Rune Amulet',     slot: 'amulet', ilvl: 22, value: 260, kind: 'amulet', size: [1, 1] },
];

/** Groups an affix can attach to. */
export const GROUPS = {
  weapon: /** @type {Slot[]} */ (['weapon']),
  armor:  /** @type {Slot[]} */ (['shield', 'helm', 'chest', 'gloves', 'boots', 'belt']),
  jewel:  /** @type {Slot[]} */ (['ring', 'amulet']),
  all:    /** @type {Slot[]} */ (['weapon', 'shield', 'helm', 'chest', 'gloves', 'boots', 'belt', 'ring', 'amulet']),
};

/**
 * @typedef {Object} AffixTier
 * @property {string} label   The word added to the item name at this tier
 * @property {number} ilvl    Minimum ilvl required to roll it
 * @property {number} min
 * @property {number} max
 * @property {number} [w]     Weight (default 10)
 */
/**
 * @typedef {Object} AffixDef
 * @property {string} id
 * @property {'prefix'|'suffix'} kind
 * @property {string} stat
 * @property {Slot[]} slots
 * @property {AffixTier[]} tiers
 * @property {boolean} [float] Roll decimals instead of integers
 */

/** Prefixes — they sit in front of the base name: "Honed Hand Axe". */
/** @type {AffixDef[]} */
export const PREFIXES = [
  { id: 'wdmg', kind: 'prefix', stat: 'dmgPct', slots: GROUPS.weapon, tiers: [
    { label: 'Honed',      ilvl: 1,  min: 6, max: 12 },
    { label: 'Forged',     ilvl: 7,  min: 13, max: 22 },
    { label: "Warrior's",  ilvl: 14, min: 23, max: 34 },
    { label: "Headsman's", ilvl: 22, min: 35, max: 50, w: 6 },
    { label: "Giant's",    ilvl: 32, min: 51, max: 72, w: 3 },
  ]},
  { id: 'wflat', kind: 'prefix', stat: 'dmgFlat', slots: GROUPS.weapon, tiers: [
    { label: 'Weighted',   ilvl: 1,  min: 1, max: 2 },
    { label: 'Iron-shod',  ilvl: 6,  min: 2, max: 4 },
    { label: 'Ore-fed',    ilvl: 14, min: 5, max: 8 },
    { label: "Mountain's", ilvl: 24, min: 9, max: 13, w: 6 },
  ]},
  { id: 'aspd', kind: 'prefix', stat: 'attackSpeed', slots: GROUPS.weapon, tiers: [
    { label: 'Nimble',   ilvl: 4,  min: 5, max: 8 },
    { label: 'Wrathful', ilvl: 12, min: 9, max: 13 },
    { label: 'Furious',  ilvl: 22, min: 14, max: 19, w: 5 },
  ]},
  { id: 'cold', kind: 'prefix', stat: 'coldDmg', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'Hoarfrost',   ilvl: 3,  min: 2, max: 4 },
    { label: 'Glacial',     ilvl: 10, min: 5, max: 9 },
    { label: "Blizzard's",  ilvl: 19, min: 10, max: 17 },
    { label: "Winter's",    ilvl: 29, min: 18, max: 29, w: 5 },
  ]},
  { id: 'fire', kind: 'prefix', stat: 'fireDmg', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'Ember',   ilvl: 3,  min: 2, max: 5 },
    { label: 'Flame',   ilvl: 11, min: 6, max: 11 },
    { label: 'Pyre',    ilvl: 21, min: 12, max: 20 },
  ]},
  { id: 'light', kind: 'prefix', stat: 'lightDmg', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'Sparking',   ilvl: 5,  min: 1, max: 7 },
    { label: 'Thunderous', ilvl: 14, min: 2, max: 14 },
    { label: 'Storm-torn', ilvl: 26, min: 3, max: 25 },
  ]},
  { id: 'apct', kind: 'prefix', stat: 'armorPct', slots: GROUPS.armor, tiers: [
    { label: 'Leathered',  ilvl: 1,  min: 8, max: 16 },
    { label: 'Ringed',     ilvl: 8,  min: 17, max: 30 },
    { label: 'Plated',     ilvl: 16, min: 31, max: 48 },
    { label: "Fortress'",  ilvl: 26, min: 49, max: 72, w: 6 },
  ]},
  { id: 'life', kind: 'prefix', stat: 'life', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'Vital',     ilvl: 1,  min: 4, max: 8 },
    { label: "Heart's",   ilvl: 8,  min: 9, max: 16 },
    { label: "Soul's",    ilvl: 17, min: 17, max: 28 },
    { label: 'Undying',   ilvl: 27, min: 29, max: 46, w: 5 },
  ]},
];

/**
 * Suffixes — "of the X".
 *
 * The four attribute suffixes went out with the attribute points: a mod that
 * raises a number nothing reads is worse than no mod at all. Their weight is
 * absorbed by the twenty-one that remain, which are all things you can feel.
 */
/** @type {AffixDef[]} */
export const SUFFIXES = [
  { id: 'armorflat', kind: 'suffix', stat: 'armor', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'of the Shield', ilvl: 1,  min: 2, max: 6 },
    { label: 'of the Shield', ilvl: 10, min: 7, max: 15 },
    { label: 'of the Shield', ilvl: 20, min: 16, max: 29 },
  ]},
  { id: 'rescold', kind: 'suffix', stat: 'resCold', slots: GROUPS.all, tiers: [
    { label: 'of Frost', ilvl: 1,  min: 4, max: 9 },
    { label: 'of Frost', ilvl: 12, min: 10, max: 18 },
    { label: 'of Frost', ilvl: 24, min: 19, max: 28 },
  ]},
  { id: 'resfire', kind: 'suffix', stat: 'resFire', slots: GROUPS.all, tiers: [
    { label: 'of the Flame', ilvl: 1,  min: 4, max: 9 },
    { label: 'of the Flame', ilvl: 12, min: 10, max: 18 },
    { label: 'of the Flame', ilvl: 24, min: 19, max: 28 },
  ]},
  { id: 'reslight', kind: 'suffix', stat: 'resLight', slots: GROUPS.all, tiers: [
    { label: 'of the Storm', ilvl: 1,  min: 4, max: 9 },
    { label: 'of the Storm', ilvl: 12, min: 10, max: 18 },
    { label: 'of the Storm', ilvl: 24, min: 19, max: 28 },
  ]},
  { id: 'resall', kind: 'suffix', stat: 'resAll', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'of Warding', ilvl: 15, min: 3, max: 7, w: 6 },
    { label: 'of Warding', ilvl: 28, min: 8, max: 13, w: 3 },
  ]},
  { id: 'ms', kind: 'suffix', stat: 'moveSpeed', slots: ['boots', 'ring', 'amulet'], tiers: [
    { label: 'of the Wind', ilvl: 4,  min: 3, max: 6 },
    { label: 'of the Wind', ilvl: 15, min: 7, max: 11 },
  ]},
  { id: 'crit', kind: 'suffix', stat: 'critChance', slots: [...GROUPS.weapon, ...GROUPS.jewel, 'gloves'], tiers: [
    { label: 'of the Hunter', ilvl: 6,  min: 1, max: 3 },
    { label: 'of the Hunter', ilvl: 18, min: 4, max: 7 },
  ]},
  { id: 'critmult', kind: 'suffix', stat: 'critMult', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'of Murder', ilvl: 10, min: 10, max: 20 },
    { label: 'of Murder', ilvl: 24, min: 21, max: 36, w: 6 },
  ]},
  { id: 'leech', kind: 'suffix', stat: 'lifeSteal', slots: [...GROUPS.weapon, ...GROUPS.jewel], tiers: [
    { label: 'of the Wolf', ilvl: 12, min: 1, max: 2, w: 7 },
    { label: 'of the Wolf', ilvl: 24, min: 3, max: 5, w: 4 },
  ]},
  // Scaled to the new trickle: a good roll is worth roughly three times your
  // base regeneration, not twenty times it.
  { id: 'regen', kind: 'suffix', stat: 'lifeRegen', slots: [...GROUPS.armor, ...GROUPS.jewel], float: true, tiers: [
    { label: 'of the Hearth', ilvl: 2, min: 0.05, max: 0.12 },
    { label: 'of the Hearth', ilvl: 14, min: 0.14, max: 0.30 },
  ]},
  { id: 'sta', kind: 'suffix', stat: 'mana', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'of Endurance', ilvl: 1,  min: 3, max: 7 },
    { label: 'of Endurance', ilvl: 13, min: 8, max: 15 },
  ]},
  { id: 'mana', kind: 'suffix', stat: 'mana', slots: [...GROUPS.armor, ...GROUPS.jewel], tiers: [
    { label: 'of Wisdom', ilvl: 1,  min: 4, max: 9 },
    { label: 'of Wisdom', ilvl: 13, min: 10, max: 18 },
    { label: 'of Wisdom', ilvl: 25, min: 19, max: 30 },
  ]},
  { id: 'mf', kind: 'suffix', stat: 'magicFind', slots: [...GROUPS.jewel, 'helm', 'boots'], tiers: [
    { label: 'of Fortune', ilvl: 4,  min: 4, max: 10 },
    { label: 'of Fortune', ilvl: 16, min: 11, max: 22, w: 6 },
  ]},
];

/**
 * Unique items — fixed, memorable and rare. These are the drops that make a
 * player shout. Keep them few and clearly distinct — and, now that gear
 * survives a run, keep their numbers modest. A unique should change how a
 * character feels, not replace the character.
 * @typedef {Object} UniqueDef
 * @property {string} id
 * @property {string} name
 * @property {string} base    BaseItem id
 * @property {number} ilvl
 * @property {Mods} mods
 * @property {string} flavor
 */
/** @type {UniqueDef[]} */
export const UNIQUES = [
  { id: 'wolfbite', name: 'Wolfbite', base: 'handaxe', ilvl: 5, flavor: '"It bit first. It bit last."',
    mods: { dmgPct: 32, attackSpeed: 10, lifeSteal: 2, moveSpeed: 5, critChance: 3 } },
  { id: 'wintertongue', name: "Winter's Tongue", base: 'longsword', ilvl: 12, flavor: '"Steel that breathes out instead of in."',
    mods: { dmgPct: 36, coldDmg: 14, freezeChance: 12, resCold: 14 } },
  { id: 'jarlsburden', name: "The Jarl's Burden", base: 'chainmail', ilvl: 16, flavor: '"He wore it until the ground gave way."',
    mods: { armorPct: 55, life: 28, resAll: 8, moveSpeed: -8, dmgFlat: 4 } },
  { id: 'lasthearth', name: 'The Last Hearth', base: 'silveramulet', ilvl: 13, flavor: '"For as long as one ember remains."',
    mods: { resAll: 10, lifeRegen: 0.3, life: 20, resFire: 10 } },
  { id: 'iceeye', name: 'Ice Eye', base: 'silverring', ilvl: 11, flavor: '"It sees what the snow has buried."',
    mods: { coldDmg: 9, resCold: 18, magicFind: 16, mana: 16 } },
  { id: 'stormstride', name: 'Stormstride', base: 'chainboots', ilvl: 14, flavor: '"No drift ever held him."',
    mods: { moveSpeed: 13, armorPct: 26, resLight: 14, mana: 13 } },
];

/** Readable names + formatting for every stat. */
export const STAT_INFO = /** @type {Record<string,{label:string, fmt:(v:number)=>string, order:number}>} */ ({
  dmgPct:      { label: 'Weapon damage',     fmt: v => `+${v}%`,        order: 1 },
  dmgFlat:     { label: 'Damage',            fmt: v => `+${v}`,         order: 2 },
  attackSpeed: { label: 'Attack speed',      fmt: v => `+${v}%`,        order: 3 },
  critChance:  { label: 'Critical hit',      fmt: v => `+${v}%`,        order: 4 },
  critMult:    { label: 'Critical damage',   fmt: v => `+${v}%`,        order: 5 },
  coldDmg:     { label: 'Cold damage',       fmt: v => `+${v}`,         order: 6 },
  fireDmg:     { label: 'Fire damage',       fmt: v => `+${v}`,         order: 7 },
  lightDmg:    { label: 'Lightning damage',  fmt: v => `+${v}`,         order: 8 },
  freezeChance:{ label: 'Chance to freeze',  fmt: v => `+${v}%`,        order: 9 },
  lifeSteal:   { label: 'Life steal',        fmt: v => `+${v}%`,        order: 10 },
  armorPct:    { label: 'Armour',            fmt: v => `+${v}%`,        order: 11 },
  armor:       { label: 'Armour',            fmt: v => `+${v}`,         order: 12 },
  life:        { label: 'Life',              fmt: v => `+${v}`,         order: 13 },
  lifeRegen:   { label: 'Life regeneration', fmt: v => `+${v.toFixed(1)}/s`, order: 14 },
  // Only ever seen on gear rolled before stamina was removed; kept so such an
  // item still describes itself instead of showing a blank line.
  stamina:     { label: 'Stamina (unused)',  fmt: v => `+${v}`,         order: 15 },
  mana:        { label: 'Mana',              fmt: v => `+${v}`,         order: 15.5 },
  moveSpeed:   { label: 'Movement speed',    fmt: v => `${v >= 0 ? '+' : ''}${v}%`, order: 16 },
  resCold:     { label: 'Cold resistance',   fmt: v => `+${v}%`,        order: 21 },
  resFire:     { label: 'Fire resistance',   fmt: v => `+${v}%`,        order: 22 },
  resLight:    { label: 'Lightning resistance', fmt: v => `+${v}%`,     order: 23 },
  resAll:      { label: 'All resistances',   fmt: v => `+${v}%`,        order: 24 },
  magicFind:   { label: 'Magic find',        fmt: v => `+${v}%`,        order: 25 },
});

/**
 * How many cells an item takes in the bag, as in D2. A great sword should cost
 * space; a ring should not. That trade-off is what makes the bag a choice
 * rather than a list.
 * @type {Record<Slot,[number,number]>}
 */
export const SLOT_SIZE = {
  weapon: [2, 3], chest: [2, 3], shield: [2, 3],
  helm: [2, 2], gloves: [2, 2], boots: [2, 2],
  belt: [2, 1], ring: [1, 1], amulet: [1, 1],
};

/** @param {BaseItem} base @returns {{w:number,h:number}} */
export function itemSize(base) {
  // The base type's own shape wins over the slot default: a sword is narrow and
  // long (1×3) while an axe is broader (2×3). That turns the bag into a real
  // packing puzzle.
  const [w, h] = base.size ?? SLOT_SIZE[base.slot] ?? [1, 1];
  return { w, h };
}

export const RARITY_COLOR = /** @type {Record<Rarity,string>} */ ({
  normal: '#cfdcec', magic: '#6f9ffb', rare: '#e8d15a', unique: '#c08a3e',
});

/** Name fragments for rare items (two words, as in D2). */
export const RARE_WORDS_A = ['Blood', 'Frost', 'Shadow', 'Storm', 'Bone', 'Iron', 'Wolf', 'Grave', 'Sorrow', 'Ore', 'Rime', 'Ash', 'Lord', 'Waste'];
export const RARE_WORDS_B = ['bite', 'song', 'shard', 'oath', 'burden', 'tooth', 'claw', 'ward', 'whisper', 'brand', 'fall', 'guard', 'thirst', 'stone'];
