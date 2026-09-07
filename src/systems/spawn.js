// @ts-check
import { MONSTERS, BOSS } from '../data/monsters.js';
import { createMonster } from '../entities/monster.js';
import { Rng } from '../core/rng.js';

/** @typedef {import('./world.js').Zone} Zone */

/**
 * Fyller en zon med monster utifrån dess ankarpunkter.
 *
 * Grupperna sätts tätt (55 px spridning) i stället för utspridda: en flock ska
 * läsas som *en* flock på skärmen, och möta spelaren samlad. Nivån varierar
 * +0..2 kring zonens nivå så att enstaka fiender kan överraska.
 * @param {Zone} zone
 * @returns {import('../entities/monster.js').Monster[]}
 */
export function populateZone(zone) {
  if (zone.isTown) return [];
  const r = new Rng(zone.seed ^ 0x9e3779b9);
  const out = [];
  const pool = MONSTERS.filter(m => m.minZone <= zone.index);

  for (const a of zone.anchors) {
    const def = r.weighted(pool, m => (m.weight ?? 5) * (m.minZone === zone.index ? 1.6 : 1));
    const level = zone.level + r.int(0, 2);
    // Arketyper som normalt går i stora flockar får fler medlemmar än de tunga.
    const scale = ((def.pack[0] + def.pack[1]) / 2) / 5;
    const count = Math.max(1, Math.round(a.n * scale));

    if (a.elite) {
      out.push(createMonster(def, level + 2, a.x, a.y, { elite: true }));
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + r.range(-0.3, 0.3);
        const rad = 52 + r.range(0, 30);
        out.push(createMonster(def, level, a.x + Math.cos(ang) * rad, a.y + Math.sin(ang) * rad, {}));
      }
      continue;
    }

    for (let i = 0; i < count; i++) {
      const ang = r.range(0, Math.PI * 2), rad = r.range(0, 62);
      out.push(createMonster(def, level, a.x + Math.cos(ang) * rad, a.y + Math.sin(ang) * rad,
        { champion: r.chance(0.1) }));
    }
  }

  if (zone.bossAt && zone.bossPos) {
    out.push(createMonster(BOSS, zone.level + 4, zone.bossPos.x, zone.bossPos.y, { boss: true }));
    // Livvakterna sover med sin jarl, så arenan är tyst tills man tar första
    // steget. Att hitta honom ska vara ett ögonblick, inte ett bakhåll.
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
