// @ts-check
/**
 * The Barbarian's three skill trees.
 *
 * These are real trees: every branch has three levels, and a skill only opens
 * once its parents have at least one rank. That is D2's most important
 * progression device — you cannot cherry-pick the good bits, you have to invest
 * your way down a branch to reach the capstone.
 *
 *   Level 1  ──  two entries per tree, no requirements
 *   Level 6  ──  two middle steps, each requiring one entry
 *   Level 12 ──  one capstone, requiring both middle steps
 */

/**
 * @typedef {Object} SkillDef
 * @property {string} id
 * @property {'steel'|'frost'|'endurance'} tree
 * @property {1|2|3} tier
 * @property {string} name
 * @property {string} icon    Glyph name, see ui/glyphs.js
 * @property {'active'|'passive'} type
 * @property {number} reqLevel
 * @property {number} maxRank
 * @property {string[]} requires   Skill ids that must have at least rank 1
 * @property {number} [mana]
 * @property {number} [cooldown]
 * @property {{skill:string, pct:number}} [synergy]
 * @property {(r:number, syn:number)=>string} desc
 */

export const TREES = /** @type {const} */ ({
  steel: 'Steel',
  frost: 'Frost',
  endurance: 'Endurance',
});

export const TIER_LEVEL = /** @type {const} */ ({ 1: 1, 2: 6, 3: 12 });

/** @type {SkillDef[]} */
export const SKILLS = [
  /* ----------------------------------------------------------------- Steel */
  {
    id: 'cleave', tree: 'steel', tier: 1, name: 'Cleave', icon: 'cleave', type: 'active',
    reqLevel: 1, maxRank: 10, requires: [], mana: 5, cooldown: 0,
    synergy: { skill: 'rend', pct: 6 },
    desc: (r, syn) => `A wide sweep that hits everything in front of you.
${Math.round(115 + r * 14 + syn)}% weapon damage · 130° arc.
Synergy: +6% damage per rank in Rend.`,
  },
  {
    id: 'rend', tree: 'steel', tier: 1, name: 'Rend', icon: 'rend', type: 'active',
    reqLevel: 1, maxRank: 10, requires: [], mana: 9, cooldown: 4,
    desc: (r) => `A tearing wound that bleeds over time — ignores armour.
${Math.round(40 + r * 10)}% weapon damage up front, then ${(3 + r * 1.6).toFixed(1)} damage/s for 6 s.`,
  },
  {
    id: 'crush', tree: 'steel', tier: 2, name: 'Crushing Blow', icon: 'crush', type: 'active',
    reqLevel: 6, maxRank: 10, requires: ['cleave'], mana: 13, cooldown: 5,
    synergy: { skill: 'cleave', pct: 4 },
    desc: (r, syn) => `A heavy overhead strike that breaks the legs of whatever stands closest.
${Math.round(175 + r * 24 + syn)}% weapon damage in a narrow arc.
Stuns for ${(0.8 + r * 0.1).toFixed(1)} s and hurls the target back.
Synergy: +4% damage per rank in Cleave.`,
  },
  {
    id: 'bloodthirst', tree: 'steel', tier: 2, name: 'Bloodthirst', icon: 'bloodthirst', type: 'passive',
    reqLevel: 6, maxRank: 10, requires: ['rend'],
    desc: (r) => `Every wound you open feeds you.
+${(r * 0.7).toFixed(1)}% life steal · +${r * 2}% weapon damage.`,
  },
  {
    id: 'whirlwind', tree: 'steel', tier: 3, name: 'Whirlwind', icon: 'whirlwind', type: 'active',
    reqLevel: 12, maxRank: 10, requires: ['crush', 'bloodthirst'], mana: 24, cooldown: 9,
    synergy: { skill: 'cleave', pct: 5 },
    desc: (r, syn) => `Spin through the pack for 1.4 s, hitting everything around you.
${Math.round(55 + r * 8 + syn)}% weapon damage per hit, 4 hits/s.
You move 30% faster while spinning.
Synergy: +5% damage per rank in Cleave.`,
  },

  /* ----------------------------------------------------------------- Frost */
  {
    id: 'icenova', tree: 'frost', tier: 1, name: 'Ice Nova', icon: 'icenova', type: 'active',
    reqLevel: 1, maxRank: 10, requires: [], mana: 14, cooldown: 6,
    synergy: { skill: 'rimeaura', pct: 9 },
    desc: (r, syn) => `A wave of cold bursts out from you.
${Math.round(14 + r * 9 + syn)} cold damage in a 175 px radius, slowing for 3 s.
Synergy: +9% damage per rank in Rime Aura.`,
  },
  {
    id: 'frostbite', tree: 'frost', tier: 1, name: 'Frostbite', icon: 'frostbite', type: 'passive',
    reqLevel: 1, maxRank: 10, requires: [],
    desc: (r) => `Your weapon carries the cold onward.
+${Math.round(2 + r * 2.2)} cold damage on every attack · +${r * 2}% chance to freeze.`,
  },
  {
    id: 'shatter', tree: 'frost', tier: 2, name: 'Shatter Strike', icon: 'shatter', type: 'active',
    reqLevel: 6, maxRank: 10, requires: ['icenova'], mana: 12, cooldown: 3.5,
    desc: (r) => `Rush forward and shatter the first enemy you reach.
${Math.round(130 + r * 20)}% weapon damage + ${Math.round(8 + r * 6)} cold damage.
${Math.min(15 + r * 5, 65)}% chance to freeze the target for 2 s.`,
  },
  {
    id: 'rimeaura', tree: 'frost', tier: 2, name: 'Rime Aura', icon: 'rimeaura', type: 'passive',
    reqLevel: 6, maxRank: 10, requires: ['frostbite'],
    desc: (r) => `The cold around you bites of its own accord.
Enemies within 150 px are slowed ${Math.min(12 + r * 3, 45)}% and take ${(1 + r * 0.9).toFixed(1)} cold damage/s.
You gain +${r * 4}% cold resistance.`,
  },
  {
    id: 'wintergrasp', tree: 'frost', tier: 3, name: "Winter's Grasp", icon: 'wintergrasp', type: 'active',
    reqLevel: 12, maxRank: 10, requires: ['shatter', 'rimeaura'], mana: 30, cooldown: 20,
    synergy: { skill: 'frostbite', pct: 7 },
    desc: (r, syn) => `The ground freezes everything within 300 px in place.
${Math.round(30 + r * 16 + syn)} cold damage and a freeze lasting ${(2.4 + r * 0.2).toFixed(1)} s.
Synergy: +7% damage per rank in Frostbite.`,
  },

  /* ------------------------------------------------------------- Endurance */
  {
    id: 'toughskin', tree: 'endurance', tier: 1, name: 'Tough Hide', icon: 'toughskin', type: 'passive',
    reqLevel: 1, maxRank: 10, requires: [],
    desc: (r) => `The years in the wild have tanned you.
+${r * 13}% armour · +${r * 2}% all resistances.`,
  },
  {
    id: 'secondwind', tree: 'endurance', tier: 1, name: 'Second Wind', icon: 'secondwind', type: 'passive',
    reqLevel: 1, maxRank: 10, requires: [],
    desc: (r) => `You recover faster than you have any right to.
+${r * 9} max life · +${(r * 0.5).toFixed(1)} life/s · +${r * 6} mana.`,
  },
  {
    id: 'warcry', tree: 'endurance', tier: 2, name: 'War Cry', icon: 'warcry', type: 'active',
    reqLevel: 6, maxRank: 10, requires: ['toughskin'], mana: 19, cooldown: 14,
    desc: (r) => `A roar that silences the wilderness.
Stuns enemies within 220 px for ${(1.2 + r * 0.12).toFixed(1)} s and grants you +${10 + r * 4}% damage for 8 s.`,
  },
  {
    id: 'iceblood', tree: 'endurance', tier: 2, name: 'Ice Blood', icon: 'iceblood', type: 'passive',
    reqLevel: 6, maxRank: 10, requires: ['secondwind'],
    desc: (r) => `The cold is no longer your enemy.
+${r * 4}% cold resistance · +${r} to the cap on all resistances (75% → ${75 + r}%).`,
  },
  {
    id: 'unbreakable', tree: 'endurance', tier: 3, name: 'Unbreakable', icon: 'unbreakable', type: 'passive',
    reqLevel: 12, maxRank: 10, requires: ['warcry', 'iceblood'],
    desc: (r) => `What does not fell you makes you heavier.
All damage you take is reduced by ${(r * 2.5).toFixed(1)}% · +${r * 8} armour.
${r >= 5 ? 'You can no longer be stunned.' : 'At rank 5: you cannot be stunned.'}`,
  },
];

/** @type {Map<string, SkillDef>} */
export const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]));

/**
 * Are the prerequisites met? The requirement is rank ≥ 1 in every parent.
 * @param {Record<string, number>} skills @param {SkillDef} def
 */
export function prereqsMet(skills, def) {
  return def.requires.every(id => (skills[id] || 0) > 0);
}

/**
 * @param {Record<string, number>} skills @param {number} level @param {SkillDef} def
 * @returns {{ok:boolean, reason:string}}
 */
export function skillAvailability(skills, level, def) {
  if (level < def.reqLevel) return { ok: false, reason: `Requires level ${def.reqLevel}` };
  const missing = def.requires.filter(id => (skills[id] || 0) <= 0);
  if (missing.length) {
    const names = missing.map(id => SKILL_BY_ID.get(id)?.name ?? id).join(' and ');
    return { ok: false, reason: `Requires a point in ${names}` };
  }
  return { ok: true, reason: '' };
}
