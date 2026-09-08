// @ts-check
import { MONSTERS, BOSS } from '../data/monsters.js';
import { createMonster } from '../entities/monster.js';
import { Rng } from '../core/rng.js';

/** @typedef {import('./world.js').Zone} Zone */

/**
 * How far a point is from the nearest crossing into the next map.
 *
 * Measured to the doorway, not to the whole edge it sits on: the road runs from
 * one border to the other, so nearly every pack is near *an* edge, and treating
 * the edge as the border emptied the maps.
 * @param {Zone} zone @param {number} x @param {number} y
 */
function borderDistance(zone, x, y) {
  let best = Infinity;
  for (const e of zone.exits) {
    const d = Math.hypot(x - e.x, y - e.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Fills a zone with monsters from its anchor points.
 *
 * Groups are placed tightly (55 px spread) rather than scattered: a pack should
 * read as *one* pack on screen and meet the player together. The level varies
 * +0..2 around the zone level so the odd enemy can still surprise you.
 * @param {Zone} zone
 * @returns {import('../entities/monster.js').Monster[]}
 */
export function populateZone(zone) {
  if (zone.isTown) return [];
  const r = new Rng(zone.seed ^ 0x9e3779b9);
  const out = [];
  const pool = MONSTERS.filter(m => m.minZone <= zone.index);

  for (const a of zone.anchors) {
    // Thin the ground near a border. The maps join into one landscape now, so
    // the seam is somewhere you walk through rather than a doorway you appear
    // in — and arriving into a pack you could not have seen coming is the one
    // thing that made a crossing feel unfair. It also keeps the two maps'
    // monsters from becoming one enormous fight the moment you step over.
    const toBorder = borderDistance(zone, a.x, a.y);
    if (toBorder < 520) continue;
    const thin = toBorder < 900 ? 0.5 : 1;

    const def = r.weighted(pool, m => (m.weight ?? 5) * (m.minZone === zone.index ? 1.6 : 1));
    const level = zone.level + r.int(0, 2);
    // Archetypes that normally travel in big packs get more members than the heavy ones.
    const scale = ((def.pack[0] + def.pack[1]) / 2) / 5;
    const count = Math.max(1, Math.round(a.n * scale * thin));

    if (a.elite) {
      // One yellow, with its own pack around it. Never two of them together.
      out.push(createMonster(def, level + 2, a.x, a.y, { elite: true }));
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + r.range(-0.3, 0.3);
        const rad = 52 + r.range(0, 30);
        out.push(createMonster(def, level, a.x + Math.cos(ang) * rad, a.y + Math.sin(ang) * rad, {}));
      }
      continue;
    }

    // A blue pack is a whole pack of one kind, all of them tougher — not a
    // stronger individual hidden among ordinary ones. Scattered singles never
    // read as anything: you killed something that took a while and never knew
    // why. A group that is plainly all the same is a decision to make.
    const magic = r.chance(0.16);
    for (let i = 0; i < count; i++) {
      const ang = r.range(0, Math.PI * 2), rad = r.range(0, 62);
      out.push(createMonster(def, level, a.x + Math.cos(ang) * rad, a.y + Math.sin(ang) * rad,
        { champion: magic }));
    }
  }

  if (zone.bossAt && zone.bossPos) {
    out.push(createMonster(BOSS, zone.level + 4, zone.bossPos.x, zone.bossPos.y, { boss: true }));
    // The bodyguards sleep alongside their jarl, so the arena is silent until
    // you take the first step. Finding him should be a moment, not an ambush.
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const guard = createMonster(MONSTERS[3], zone.level + 2,
        zone.bossPos.x + Math.cos(ang) * 150, zone.bossPos.y + Math.sin(ang) * 150, { champion: true });
      guard.dormant = true;
      out.push(guard);
    }
  }
  return out;
}
