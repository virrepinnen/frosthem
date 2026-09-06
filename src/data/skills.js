// @ts-check
/**
 * Vandrarens tre skill-träd.
 *
 * Träden är riktiga träd: varje gren har tre nivåer, och en skill låses upp
 * först när dess föräldrar har minst en rank. Det är D2:s viktigaste
 * progressionsgrepp — du kan inte plocka russinen ur kakan, utan måste
 * investera dig ner genom en gren för att nå kapstenen.
 *
 *   Nivå 1  ──  två ingångar per träd, inga krav
 *   Nivå 6  ──  två mellansteg, kräver var sin ingång
 *   Nivå 12 ──  en kapsten, kräver båda mellanstegen
 */

/**
 * @typedef {Object} SkillDef
 * @property {string} id
 * @property {'stal'|'frost'|'uthallighet'} tree
 * @property {1|2|3} tier
 * @property {string} name
 * @property {string} icon
 * @property {'active'|'passive'} type
 * @property {number} reqLevel
 * @property {number} maxRank
 * @property {string[]} requires   Skill-id:n som måste ha minst rank 1
 * @property {number} [stamina]
 * @property {number} [cooldown]
 * @property {{skill:string, pct:number}} [synergy]
 * @property {(r:number, syn:number)=>string} desc
 */

export const TREES = /** @type {const} */ ({
  stal: 'Stål',
  frost: 'Frost',
  uthallighet: 'Uthållighet',
});

export const TIER_LEVEL = /** @type {const} */ ({ 1: 1, 2: 6, 3: 12 });

/** @type {SkillDef[]} */
export const SKILLS = [
  /* ------------------------------------------------------------------ Stål */
  {
    id: 'cleave', tree: 'stal', tier: 1, name: 'Klyvande hugg', icon: '🪓', type: 'active',
    reqLevel: 1, maxRank: 10, requires: [], stamina: 4, cooldown: 0,
    synergy: { skill: 'rend', pct: 6 },
    desc: (r, syn) => `Ett brett svep som träffar allt framför dig.
${Math.round(115 + r * 14 + syn)}% vapenskada · 130° båge.
Synergi: +6% skada per rank i Sarga.`,
  },
  {
    id: 'rend', tree: 'stal', tier: 1, name: 'Sarga', icon: '🩸', type: 'active',
    reqLevel: 1, maxRank: 10, requires: [], stamina: 8, cooldown: 4,
    desc: (r) => `Rivsår som blöder över tid — ignorerar rustning.
${Math.round(40 + r * 10)}% vapenskada direkt, sedan ${(3 + r * 1.6).toFixed(1)} skada/s i 6 s.`,
  },
  {
    id: 'crush', tree: 'stal', tier: 2, name: 'Krossande slag', icon: '🔨', type: 'active',
    reqLevel: 6, maxRank: 10, requires: ['cleave'], stamina: 12, cooldown: 5,
    synergy: { skill: 'cleave', pct: 4 },
    desc: (r, syn) => `Ett tungt nedslag som bryter benen på det som står närmast.
${Math.round(175 + r * 24 + syn)}% vapenskada i en smal båge.
Bedövar i ${(0.8 + r * 0.1).toFixed(1)} s och slungar undan målet.
Synergi: +4% skada per rank i Klyvande hugg.`,
  },
  {
    id: 'bloodthirst', tree: 'stal', tier: 2, name: 'Blodtörst', icon: '🥩', type: 'passive',
    reqLevel: 6, maxRank: 10, requires: ['rend'],
    desc: (r) => `Varje sår du river upp göder dig.
+${(r * 0.7).toFixed(1)}% livsdräneri · +${r * 2}% vapenskada.`,
  },
  {
    id: 'whirlwind', tree: 'stal', tier: 3, name: 'Virvelvind', icon: '🌀', type: 'active',
    reqLevel: 12, maxRank: 10, requires: ['crush', 'bloodthirst'], stamina: 22, cooldown: 9,
    synergy: { skill: 'cleave', pct: 5 },
    desc: (r, syn) => `Snurra genom fiendehopen i 1,4 s och träffa allt omkring dig.
${Math.round(55 + r * 8 + syn)}% vapenskada per träff, 4 träffar/s.
Du rör dig 30% snabbare under snurren.
Synergi: +5% skada per rank i Klyvande hugg.`,
  },

  /* ----------------------------------------------------------------- Frost */
  {
    id: 'icenova', tree: 'frost', tier: 1, name: 'Isnova', icon: '❄️', type: 'active',
    reqLevel: 1, maxRank: 10, requires: [], stamina: 14, cooldown: 6,
    synergy: { skill: 'rimeaura', pct: 9 },
    desc: (r, syn) => `En köldvåg spränger ut från dig.
${Math.round(14 + r * 9 + syn)} köldskada i 175 px radie, saktar ner i 3 s.
Synergi: +9% skada per rank i Rimfrostaura.`,
  },
  {
    id: 'frostbite', tree: 'frost', tier: 1, name: 'Frostbett', icon: '🦷', type: 'passive',
    reqLevel: 1, maxRank: 10, requires: [],
    desc: (r) => `Ditt vapen bär kylan vidare.
+${Math.round(2 + r * 2.2)} köldskada på alla attacker · +${r * 2}% chans att frysa.`,
  },
  {
    id: 'shatter', tree: 'frost', tier: 2, name: 'Krosshugg', icon: '🧊', type: 'active',
    reqLevel: 6, maxRank: 10, requires: ['icenova'], stamina: 12, cooldown: 3.5,
    desc: (r) => `Rusa framåt och krossa den första fienden du når.
${Math.round(130 + r * 20)}% vapenskada + ${Math.round(8 + r * 6)} köldskada.
${Math.min(15 + r * 5, 65)}% chans att frysa målet i 2 s.`,
  },
  {
    id: 'rimeaura', tree: 'frost', tier: 2, name: 'Rimfrostaura', icon: '🌬️', type: 'passive',
    reqLevel: 6, maxRank: 10, requires: ['frostbite'],
    desc: (r) => `Kylan omkring dig biter av sig själv.
Fiender inom 150 px saktas ${Math.min(12 + r * 3, 45)}% och tar ${(1 + r * 0.9).toFixed(1)} köldskada/s.
Du får +${r * 4}% köldmotstånd.`,
  },
  {
    id: 'wintergrasp', tree: 'frost', tier: 3, name: 'Vinterns grepp', icon: '🌨️', type: 'active',
    reqLevel: 12, maxRank: 10, requires: ['shatter', 'rimeaura'], stamina: 30, cooldown: 20,
    synergy: { skill: 'frostbite', pct: 7 },
    desc: (r, syn) => `Marken fryser fast allt inom 300 px.
${Math.round(30 + r * 16 + syn)} köldskada och frysning i ${(2.4 + r * 0.2).toFixed(1)} s.
Synergi: +7% skada per rank i Frostbett.`,
  },

  /* ----------------------------------------------------------- Uthållighet */
  {
    id: 'toughskin', tree: 'uthallighet', tier: 1, name: 'Härdad hud', icon: '🪨', type: 'passive',
    reqLevel: 1, maxRank: 10, requires: [],
    desc: (r) => `Åren i vildmarken har garvat dig.
+${r * 13}% rustning · +${r * 2}% alla motstånd.`,
  },
  {
    id: 'secondwind', tree: 'uthallighet', tier: 1, name: 'Andra andning', icon: '🫁', type: 'passive',
    reqLevel: 1, maxRank: 10, requires: [],
    desc: (r) => `Du hämtar dig snabbare än du borde.
+${r * 9} max liv · +${(r * 0.5).toFixed(1)} liv/s · +${r * 6} uthållighet.`,
  },
  {
    id: 'warcry', tree: 'uthallighet', tier: 2, name: 'Stridsrop', icon: '📢', type: 'active',
    reqLevel: 6, maxRank: 10, requires: ['toughskin'], stamina: 18, cooldown: 14,
    desc: (r) => `Ett vrål som får vildmarken att tystna.
Bedövar fiender inom 220 px i ${(1.2 + r * 0.12).toFixed(1)} s och ger dig +${10 + r * 4}% skada i 8 s.`,
  },
  {
    id: 'iceblood', tree: 'uthallighet', tier: 2, name: 'Isblod', icon: '🫀', type: 'passive',
    reqLevel: 6, maxRank: 10, requires: ['secondwind'],
    desc: (r) => `Kylan är inte längre din fiende.
+${r * 4}% köldmotstånd · +${r} till taket för alla motstånd (75% → ${75 + r}%).`,
  },
  {
    id: 'unbreakable', tree: 'uthallighet', tier: 3, name: 'Orubblig', icon: '🛡️', type: 'passive',
    reqLevel: 12, maxRank: 10, requires: ['warcry', 'iceblood'],
    desc: (r) => `Det som inte fäller dig gör dig tyngre.
All skada du tar minskas ${(r * 2.5).toFixed(1)}% · +${r * 8} rustning.
${r >= 5 ? 'Du kan inte längre bedövas.' : 'Vid rank 5: du kan inte bedövas.'}`,
  },
];

/** @type {Map<string, SkillDef>} */
export const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]));

/**
 * Är förkunskapskraven uppfyllda? Kravet är rank ≥ 1 i varje förälder.
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
  if (level < def.reqLevel) return { ok: false, reason: `Kräver nivå ${def.reqLevel}` };
  const missing = def.requires.filter(id => (skills[id] || 0) <= 0);
  if (missing.length) {
    const names = missing.map(id => SKILL_BY_ID.get(id)?.name ?? id).join(' och ');
    return { ok: false, reason: `Kräver en poäng i ${names}` };
  }
  return { ok: true, reason: '' };
}
