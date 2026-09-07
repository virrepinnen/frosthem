// @ts-check
import { createPlayer, HOTBAR_SIZE, bindToHotbar, PORTAL_CAST, PORTAL_STEP } from './entities/player.js';
import { generateZone, resolveCollision, lineBlocked, revealFog, ZONE_DEFS } from './systems/world.js';
import { populateZone } from './systems/spawn.js';
import { updateMonsters, updateProjectiles } from './systems/ai.js';
import { performSwing, useSkill, drinkPotion, hitMonster, applyFreeze, spawnGround } from './systems/combat.js';
import { pickup, canAdd } from './systems/inventory.js';
import { updateOrbs } from './systems/orbs.js';
import { rollItem } from './systems/loot.js';
import { SKILL_BY_ID } from './data/skills.js';
import { input, keyPressed, keyDown } from './core/input.js';
import { camera, updateCamera, toWorld } from './render/camera.js';
import { updateFx, clearFx, burst, floatText, screenFlash, shake } from './render/fx.js';
import { pushAlert, showOverlay, showLevelUp, hideLevelUp, levelUpOpen,
         showPauseMenu, hidePauseMenu, pauseMenuOpen } from './ui/hud.js';
import { panels, togglePanel, closeAllPanels, anyPanelOpen } from './ui/panels.js';
import { hideTooltip } from './ui/tooltip.js';
import { saveGame } from './systems/save.js';
import { createPending, hasPending, resetPending } from './systems/allocation.js';
import { COMBAT_REGEN, COMBAT_WINDOW } from './systems/stats.js';
import { rng } from './core/rng.js';
import { clamp } from './core/math.js';


/**
 * Central speltillstånd + uppdateringsloop.
 * @param {ReturnType<typeof createPlayer>} [existing] Laddad karaktär, annars ny
 * @param {{waypoints?:number[], zoneIndex?:number, bossDefeated?:boolean, charId?:string}} [progress]
 */
export function createGame(existing, progress) {
  const game = {
    player: existing ?? createPlayer(),
    /** @type {import('./systems/world.js').Zone} */
    zone: /** @type {any} */ (null),
    /** @type {import('./entities/monster.js').Monster[]} */ monsters: [],
    /** @type {any[]} */ ground: [],
    /** @type {any[]} */ projectiles: [],
    /** @type {any[]} */ novas: [],
    /** @type {import('./systems/orbs.js').Orb[]} */ orbs: [],
    groundVersion: 0,
    dirtyUI: true,
    playerSlow: 0,
    bossDefeated: progress?.bossDefeated ?? false,
    /** @type {string|undefined} Sparplatsens id; sätts vid första sparningen. */
    charId: progress?.charId,
    victoryT: 3,
    /** Upptäckta vägstenar. Byn räknas alltid som känd. */
    waypoints: new Set(progress?.waypoints ?? [0]),
    /** @type {null|{zoneIndex:number, zoneName:string, fromPos:{x:number,y:number}, townPos:{x:number,y:number}|null, stash:any}} */
    portal: null,
    skillDefs: SKILL_BY_ID,
    aim: { x: 0, y: 0 },
    /** @type {any} */ aimTarget: null,
    /** @type {any} */ interact: null,
    time: 0,
    paused: false,
    saveT: 0,
    levelUpPending: 0,
    settings: { autoAim: true, autoAttack: true },
    /** Väntande poängfördelning — bekräftas eller ångras av spelaren. */
    pending: createPending(),
    /** @type {'stal'|'frost'|'uthallighet'} */ skillTab: 'stal',

    /** @param {string} t */
    alert(t) { pushAlert(t); },
    /**
     * Nivåhöjningen sker nu när klot sopas upp, inte i stridsloopen — rutan
     * dyker alltså upp när du samlar in bytet, inte mitt i ett svep.
     * @param {number} levels
     */
    onLevelUp(levels) {
      const p = game.player;
      burst(p.pos.x, p.pos.y, 90, { color: '#ffd88a', speed: 300, life: 1.4, size: 3.4, grav: -70 });
      burst(p.pos.x, p.pos.y, 30, { color: '#fff3d0', speed: 120, life: 1.8, size: 2.2, grav: -110 });
      floatText(p.pos.x, p.pos.y - 62, `NIVÅ ${p.level}`, '#ffd88a', 26);
      screenFlash(0.34, '#d8b26a');
      shake(7);
      game.levelUpPending = (game.levelUpPending || 0) + levels;
    },
    /** @param {string} id */
    tryUseSkill(id) { if (useSkill(game, id)) game.dirtyUI = true; },
    tryDrink() { drinkPotion(game); game.dirtyUI = true; },
    /** @param {any} g */
    tryPickup(g) {
      if (Math.hypot(g.x - game.player.pos.x, g.y - game.player.pos.y) > 190) { game.alert('För långt bort.'); return; }
      if (pickup(game, g)) { game.ground.splice(game.ground.indexOf(g), 1); game.groundVersion++; }
    },
    /** @param {number} to @param {number} [from] */
    travel(to, from) { travel(game, to, from); },
    /** @param {number} index */
    travelToWaypoint(index) { travelToWaypoint(game, index); },
    waypointList() {
      return ZONE_DEFS.map((z, i) => ({
        index: i, name: z.name, level: z.level,
        known: game.waypoints.has(i), here: game.zone.index === i,
      }));
    },
    save() { const ok = saveGame(game); if (ok) game.alert('Sparat.'); return ok; },
    /** @param {string} id Flyttar en skill till nästa snabbfack. */
    bindNext(id) { bindToHotbar(game.player, id, true); game.dirtyUI = true; },
    /** Kastar väntande poäng — används när man stänger utan att låsa in. */
    dropPending() { if (hasPending(game.pending)) { resetPending(game.pending); game.dirtyUI = true; } },
    togglePause() {
      if (pauseMenuOpen()) { hidePauseMenu(); game.paused = false; }
      else { game.paused = true; showPauseMenu(game); }
    },
    autosave() { game.saveT = 0.6; },
    update: (/** @type {number} */ dt) => update(game, dt),
  };

  travel(game, progress?.zoneIndex ?? 0);
  return game;
}

/** @typedef {ReturnType<typeof createGame>} Game */

/* ------------------------------------------------------------------ */
/* Resor                                                               */
/* ------------------------------------------------------------------ */

/** @param {Game} game */
function snapshot(game) {
  return {
    zone: game.zone, monsters: game.monsters, ground: game.ground,
    projectiles: game.projectiles, novas: game.novas, orbs: game.orbs,
  };
}

/**
 * @param {Game} game @param {number} to @param {number} [from]
 * @param {{restore?:any, at?:{x:number,y:number}, keepPortal?:boolean}} [opts]
 */
function travel(game, to, from, opts = {}) {
  const idx = clamp(to, 0, ZONE_DEFS.length - 1);

  if (opts.restore) {
    game.zone = opts.restore.zone;
    game.monsters = opts.restore.monsters;
    game.ground = opts.restore.ground;
    game.projectiles = opts.restore.projectiles;
    game.novas = opts.restore.novas;
    game.orbs = opts.restore.orbs ?? [];
  } else {
    game.zone = generateZone(idx, (rng.next() * 0xffffffff) >>> 0);
    game.monsters = populateZone(game.zone);
    game.ground = [];
    game.projectiles = [];
    game.novas = [];
    game.orbs = [];
  }
  game.groundVersion++;
  game.victoryT = 3;
  clearFx();

  // En öppen portal överlever bara resan mellan sina två ändpunkter.
  if (!opts.keepPortal && game.portal && idx !== 0 && idx !== game.portal.zoneIndex) {
    game.portal = null;
    game.alert('Portalen slöts bakom dig.');
  }

  const p = game.player;
  let spawn = opts.at ?? { ...game.zone.entry };
  if (!opts.at && from !== undefined) {
    const back = game.zone.exits.find(e => e.to === from);
    if (back) spawn = { x: back.x, y: back.y + (back.dir === 'söder' ? -90 : 90) };
  }
  p.pos.x = spawn.x; p.pos.y = spawn.y;
  p.vel.x = p.vel.y = 0;
  p.swing = null; p.dash = null; p.whirl = null; p.cast = null;
  resolveCollision(game.zone, p.pos, p.radius);

  camera.x = p.pos.x - camera.w / 2;
  camera.y = p.pos.y - camera.h / 2;

  if (game.zone.isTown) {
    p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana;
    game.waypoints.add(0);
    game.alert('Frosthem. Härden brinner ännu.');
  } else {
    game.alert(`${game.zone.name} — monsternivå ${game.zone.level}`);
  }
  game.dirtyUI = true;
  hideTooltip();
  game.autosave();
}

/** @param {Game} game @param {number} index */
function travelToWaypoint(game, index) {
  if (!game.waypoints.has(index)) { game.alert('Du har inte hittat den vägstenen än.'); return; }
  if (game.zone.index === index) { game.alert('Du står redan här.'); return; }
  game.portal = null;
  travel(game, index);
  const wp = game.zone.waypoint;
  if (wp) {
    game.player.pos.x = wp.x;
    game.player.pos.y = wp.y + 60;
    resolveCollision(game.zone, game.player.pos, game.player.radius);
    camera.x = game.player.pos.x - camera.w / 2;
    camera.y = game.player.pos.y - camera.h / 2;
  }
  burst(game.player.pos.x, game.player.pos.y, 40, { color: '#8fd8f4', speed: 220, life: 0.8, size: 3, grav: -40 });
}

/**
 * Stadsportal: en tur-och-retur-genväg som bevarar zonen du lämnade, inklusive
 * monster och loot på marken. Utan bevarandet vore portalen värdelös, eftersom
 * zonerna annars genereras om vid varje besök.
 * @param {Game} game
 */
function openTownPortal(game) {
  const p = game.player;
  if (game.zone.isTown) {
    if (game.portal) { returnThroughPortal(game); return; }
    game.alert('Du står redan i Frosthem.');
    return;
  }
  if (p.cast) return;
  p.cast = { t: 0, x: p.pos.x, y: p.pos.y };
  game.alert('Öppnar en portal mot Frosthem…');
}

/** @param {Game} game @param {string} why */
function cancelPortalCast(game, why) {
  const p = game.player;
  if (!p.cast) return;
  burst(p.cast.x, p.cast.y - 8, 16, { color: '#7a8ea0', speed: 130, life: 0.5, size: 2.4 });
  p.cast = null;
  game.alert(why);
}

/** Fullbordar portalen och reser. @param {Game} game */
function finishTownPortal(game) {
  const p = game.player;
  const at = p.cast ? { x: p.cast.x, y: p.cast.y } : { x: p.pos.x, y: p.pos.y };
  p.cast = null;
  game.portal = {
    zoneIndex: game.zone.index,
    zoneName: game.zone.name,
    fromPos: at,
    townPos: null,
    stash: snapshot(game),
  };
  burst(at.x, at.y, 50, { color: '#8fd8f4', speed: 260, life: 0.9, size: 3, grav: -50 });
  screenFlash(0.16, '#7fd4f0');
  travel(game, 0, undefined, { keepPortal: true });
  game.portal.townPos = townPortalPad(game);
  game.alert(`Portal öppnad mot ${game.portal.zoneName}. Tryck E vid den för att resa tillbaka.`);
}

/**
 * Tickar laddningen. Rörelse bryter medan man laddar, men i öppningsskedet är
 * man fast — då är klivet redan taget.
 * @param {Game} game @param {number} dt @param {boolean} moving
 * @returns {boolean} true om laddningen låser övriga handlingar
 */
function updatePortalCast(game, dt, moving) {
  const p = game.player;
  if (!p.cast) return false;
  const stepping = p.cast.t >= PORTAL_CAST - PORTAL_STEP;
  if (moving && !stepping) { cancelPortalCast(game, 'Du rörde dig — portalen bröts.'); return false; }

  p.cast.t += dt;
  if (stepping) {
    // Gestalten glider in i porten under den sista halvsekunden.
    p.pos.x += (p.cast.x - p.pos.x) * Math.min(1, dt * 9);
    p.pos.y += (p.cast.y - p.pos.y) * Math.min(1, dt * 9);
    if (rng.chance(0.6)) {
      burst(p.cast.x, p.cast.y - 12, 2, { color: '#a8e4f8', speed: 90, life: 0.5, size: 2.4, grav: -60 });
    }
    if (p.cast.t >= PORTAL_CAST) { finishTownPortal(game); return true; }
  } else if (rng.chance(0.5)) {
    // energin dras inåt mot fötterna medan man laddar
    const a = rng.range(0, Math.PI * 2), rad = rng.range(42, 72);
    burst(p.cast.x + Math.cos(a) * rad, p.cast.y + Math.sin(a) * rad, 1,
      { color: '#8fd8f4', speed: 18, life: 0.6, size: 2.2, grav: -8 });
  }
  return true;
}

/** Byns portalplats, med en säker reserv om zonen saknar den. @param {Game} game */
function townPortalPad(game) {
  const pad = game.zone.portalPad;
  if (pad) return { x: pad.x, y: pad.y };
  return { x: game.player.pos.x - 90, y: game.player.pos.y + 30 };
}

/** @param {Game} game */
function returnThroughPortal(game) {
  const portal = game.portal;
  if (!portal) return;
  travel(game, portal.zoneIndex, undefined, {
    restore: portal.stash, at: portal.fromPos, keepPortal: true,
  });
  burst(game.player.pos.x, game.player.pos.y, 40, { color: '#8fd8f4', speed: 220, life: 0.8, size: 3, grav: -40 });
  game.alert('Tillbaka i vildmarken.');
}

/* ------------------------------------------------------------------ */
/* Uppdatering                                                         */
/* ------------------------------------------------------------------ */

/** @param {Game} game @param {number} dt */
function update(game, dt) {
  game.time += dt;
  const p = game.player;

  game.aim = toWorld(input.mouse.x, input.mouse.y);
  handleUiKeys(game);

  if (game.saveT > 0) {
    game.saveT -= dt;
    if (game.saveT <= 0) saveGame(game);
  }

  if (game.paused) { updateFx(dt); return; }

  game.playerSlow = 0;
  revealFog(game.zone, p.pos.x, p.pos.y);
  updatePlayer(game, dt);
  updateMonsters(game, dt);
  updateProjectiles(game, dt);
  updateGround(game, dt);
  updateOrbs(game, dt);
  updateNovas(game, dt);
  updateFx(dt);
  updateCamera(game, dt);

  if (game.levelUpPending > 0 && !game.paused) {
    const levels = game.levelUpPending;
    game.levelUpPending = 0;
    game.paused = true;
    saveGame(game);
    showLevelUp(game, levels);
  }

  if (!game.bossDefeated && game.zone.bossAt) {
    const boss = game.monsters.find(m => m.isBoss && !m.dead);
    if (!boss) game.victoryT -= dt;
    if (!boss && game.victoryT <= 0) {
      game.bossDefeated = true;
      game.paused = true;
      saveGame(game);
      showOverlay('Hravn har fallit',
        `Graven är tyst. ${p.name} står kvar på nivå <b>${p.level}</b> med ${p.kills} fällda fiender.<br><br>` +
        'Vildmarken fyller sig själv igen — zonerna genereras om varje gång du går in i dem.',
        'Fortsätt', () => { game.paused = false; });
    }
  }
}

/** @param {Game} game */
function handleUiKeys(game) {
  if (keyPressed('i')) togglePanel(game, 'inventory');
  if (keyPressed('c')) togglePanel(game, 'character');
  if (keyPressed('k')) togglePanel(game, 'skills');
  if (keyPressed('f5')) game.save();
  if (keyPressed('escape')) {
    // Esc städar först undan det som ligger överst, och pausar först när
    // skärmen är ren.
    if (levelUpOpen()) { game.dropPending(); hideLevelUp(); closeAllPanels(game); game.paused = false; }
    else if (anyPanelOpen()) { game.dropPending(); closeAllPanels(game); }
    else game.togglePause();
  }
}

/** @param {Game} game @param {number} dt */
function updatePlayer(game, dt) {
  const p = game.player;
  const zone = game.zone;

  if (p.dead) {
    p.deathT -= dt;
    if (p.deathT <= 0 && !game.paused) {
      game.paused = true;
      saveGame(game);
      showOverlay('Du föll i snön',
        'Kylan tog dig. Gerd drar in dig i Frosthem igen — du behåller allt du bär.<br><br>' +
        '<i>Straffet vid död är medvetet mjukt i prototypen; det är enkelt att skärpa när balansen sitter.</i>',
        'Vakna i Frosthem',
        () => {
          p.dead = false;
          p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana;
          p.swing = null; p.dash = null; p.whirl = null;
          game.paused = false;
          travel(game, 0, undefined, { keepPortal: true });
        });
    }
    return;
  }

  // ---- timers --------------------------------------------------------------
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.attackTimer = Math.max(0, p.attackTimer - dt);
  p.rollCd = Math.max(0, (p.rollCd ?? 0) - dt);
  for (const k in p.cooldowns) if (p.cooldowns[k] > 0) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
  if (p.dmgBuffT > 0) { p.dmgBuffT -= dt; if (p.dmgBuffT <= 0) p.dmgBuff = 0; }
  if (p.slamSlowT > 0) { p.slamSlowT -= dt; game.playerSlow = Math.max(game.playerSlow, 0.45); }
  tickShrineBuffs(p, dt);
  if (p.swing) { p.swing.t += dt; if (p.swing.t >= p.swing.dur) p.swing = null; }

  p.hp = Math.min(p.maxHp, p.hp + p.lifeRegen * dt);
  // Uthålligheten återhämtar sig långsamt så länge du slåss, snabbt när du
  // bryter kontakten. Det är den rytmen hela stridsekonomin vilar på.
  p.combatT = Math.max(0, (p.combatT ?? 0) - dt);
  const regen = p.staminaRegen * (p.combatT > 0 ? COMBAT_REGEN : 1);
  p.stamina = Math.min(p.maxStamina, p.stamina + regen * dt);
  p.exhausted = p.stamina < p.attackCost;
  // Mana bryr sig inte om strid — den fyller på i jämn takt, så de två
  // resurserna känns olika i handen i stället för att vara samma sak i två färger.
  p.mana = Math.min(p.maxMana, p.mana + p.manaRegen * dt);
  p.manaFlash = Math.max(0, (p.manaFlash ?? 0) - dt);

  // ---- rörelse -------------------------------------------------------------
  const wasX = p.pos.x, wasY = p.pos.y;
  let mx = 0, my = 0;
  // Bara piltangenter. WASD är borttaget med flit: vänsterhanden ska tillhöra
  // 1–6 och Q, inte konkurrera med rörelsen.
  if (keyDown('arrowup')) my -= 1;
  if (keyDown('arrowdown')) my += 1;
  if (keyDown('arrowleft')) mx -= 1;
  if (keyDown('arrowright')) mx += 1;

  // ---- sikte ---------------------------------------------------------------
  // Med auto-sikte behöver högerhanden bara sköta rörelsen: figuren vänder sig
  // mot närmaste fiende med fri sikt, annars åt det håll den går.
  updateAiming(game, mx, my);

  // Laddar man portalen står man stilla och kan inget annat göra.
  const casting = updatePortalCast(game, dt, !!(mx || my));
  if (casting) { mx = 0; my = 0; }

  let speed = p.moveSpeed * (1 - game.playerSlow) * (1 + (p.speedBuff || 0));
  if (p.whirl) speed *= 1.3;

  if (p.roll) {
    // Rullningen ger osårbarhet i mitten av rörelsen, inte i början och slutet —
    // den ska belöna rätt timing, inte vara en knapp man håller inne.
    p.roll.t -= dt;
    const k = 1 - p.roll.t / p.roll.dur;
    const ease = 1 - Math.pow(k, 2.2);
    p.pos.x += Math.cos(p.roll.dir) * 940 * ease * dt;
    p.pos.y += Math.sin(p.roll.dir) * 940 * ease * dt;
    if (k > 0.12 && k < 0.82) p.invuln = Math.max(p.invuln, 0.05);
    if (rng.chance(0.6)) burst(p.pos.x, p.pos.y + 8, 2, { color: '#e8f0fa', speed: 60, life: 0.4, size: 2.4, grav: -10 });
    resolveCollision(zone, p.pos, p.radius);
    if (p.roll.t <= 0) p.roll = null;
  } else if (p.dash) {
    p.dash.t -= dt;
    const dashSpeed = 950;
    p.pos.x += Math.cos(p.dash.dir) * dashSpeed * dt;
    p.pos.y += Math.sin(p.dash.dir) * dashSpeed * dt;
    burst(p.pos.x, p.pos.y, 2, { color: '#a8e4f8', speed: 30, life: 0.35, size: 2.4, grav: 0 });
    resolveDash(game);
    if (p.dash.t <= 0) p.dash = null;
  } else if (mx || my) {
    const len = Math.hypot(mx, my);
    p.pos.x += (mx / len) * speed * dt;
    p.pos.y += (my / len) * speed * dt;
    p.walkPhase += dt * (speed / 168);
    // Manteln släpar åt det håll man kommer ifrån, inte rakt bakåt.
    p.moveAngle = Math.atan2(my, mx);
    p.moving = true;
  } else {
    p.moving = false;
  }
  resolveCollision(zone, p.pos, p.radius);

  // Hastigheten mäts ur den faktiska förflyttningen — då gäller den lika bra
  // för gång som för rusning, rullning och att bli stoppad av en vägg.
  const inst = dt > 0 ? { x: (p.pos.x - wasX) / dt, y: (p.pos.y - wasY) / dt } : { x: 0, y: 0 };
  p.velX += (inst.x - p.velX) * Math.min(1, dt * 18);
  p.velY += (inst.y - p.velY) * Math.min(1, dt * 18);
  updateCloak(p, dt);

  if (p.whirl) {
    p.whirl.t -= dt;
    p.whirl.tick -= dt;
    if (p.whirl.tick <= 0) {
      p.whirl.tick = 0.25;
      const r = p.skills.whirlwind || 1;
      const syn = (p.skills.cleave || 0) * 5;
      performSwing(game, { arc: Math.PI * 2, reach: 76, mult: (55 + r * 8 + syn) / 100, kind: 'whirl' });
    }
    if (p.whirl.t <= 0) p.whirl = null;
  }

  // ---- attacker ------------------------------------------------------------
  // Auto-attack: står en fiende inom räckhåll slår du av dig själv. Musen
  // behövs inte alls — men den fungerar fortfarande som manuell utlösare.
  if (!anyPanelOpen() && !casting && !p.whirl && !p.dash && !p.roll && p.attackTimer <= 0) {
    const t = game.aimTarget;
    const inReach = t && !t.dead
      && Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) <= 66 + t.radius;
    const wants = input.mouse.down || (game.settings.autoAttack && inReach);
    if (wants) {
      if (p.stamina >= p.attackCost) {
        p.stamina -= p.attackCost;
        p.combatT = COMBAT_WINDOW;
        p.attackTimer = 1 / (1.5 * p.attackSpeed);
        performSwing(game, { arc: 1.5, reach: 66, mult: 1, kind: 'basic' });
      } else {
        // Utmattad: pysslar inte med att spamma varningar, men markerar tydligt.
        p.attackTimer = 0.3;
        p.staminaFlash = 0.45;
        if ((p.exhaustAlertT ?? 0) <= 0) { p.exhaustAlertT = 6; game.alert('Utmattad — dra dig undan och hämta andan.'); }
      }
    }
  }
  p.exhaustAlertT = Math.max(0, (p.exhaustAlertT ?? 0) - dt);
  p.staminaFlash = Math.max(0, (p.staminaFlash ?? 0) - dt);
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    if (keyPressed(String(i + 1))) {
      const id = p.hotbar[i];
      if (id && !casting) game.tryUseSkill(id);
    }
  }
  if (keyPressed('q') && !casting) game.tryDrink();
  if (keyPressed(' ') && !casting) dodgeRoll(game);
  if (keyPressed('t')) {
    if (p.cast) cancelPortalCast(game, 'Du avbröt portalen.');
    else openTownPortal(game);
  }
  if (keyPressed('e') && !casting) interact(game);

  // ---- platser man går in i ------------------------------------------------
  for (const s of zone.shrines) {
    if (s.used) continue;
    if (Math.hypot(p.pos.x - s.x, p.pos.y - s.y) > s.r + p.radius) continue;
    activateShrine(game, s);
  }
  // Går man ifrån Gerd stängs handeln av sig själv — man ska inte behöva
  // klicka bort en panel man redan lämnat.
  if (panels.vendor) {
    const gerd = zone.npcs.find(n => n.id === 'gerd');
    if (!gerd || Math.hypot(p.pos.x - gerd.x, p.pos.y - gerd.y) > 190) {
      panels.vendor = false;
      panels.inventory = false;
      game.dirtyUI = true;
    }
  }
  game.interact = findInteract(game);

  const wp = zone.waypoint;
  if (wp && !game.waypoints.has(zone.index)
      && Math.hypot(p.pos.x - wp.x, p.pos.y - wp.y) < wp.r + p.radius + 10) {
    game.waypoints.add(zone.index);
    game.alert(`Vägsten upptäckt: ${zone.name}.`);
    burst(wp.x, wp.y - 20, 40, { color: '#8fd8f4', speed: 180, life: 1, size: 3, grav: -50 });
    game.dirtyUI = true;
    game.autosave();
  }
}

/**
 * @param {Game} game @param {number} mx @param {number} my
 */
function updateAiming(game, mx, my) {
  const p = game.player;
  if (!game.settings.autoAim) {
    p.facing = Math.atan2(game.aim.y - p.pos.y, game.aim.x - p.pos.x);
    game.aimTarget = null;
    return;
  }
  let best = null, bestD = Infinity;
  for (const m of game.monsters) {
    if (m.dead) continue;
    const d = Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y);
    if (d > 360 || d >= bestD) continue;
    if (lineBlocked(game.zone, p.pos.x, p.pos.y, m.pos.x, m.pos.y)) continue;
    bestD = d; best = m;
  }
  game.aimTarget = best;
  if (best) p.facing = Math.atan2(best.pos.y - p.pos.y, best.pos.x - p.pos.x);
  else if (mx || my) p.facing = Math.atan2(my, mx);
}

/** @param {Game} game */
function resolveDash(game) {
  const p = game.player;
  if (!p.dash || !p.pendingShatter) return;
  for (const m of game.monsters) {
    if (m.dead || p.dash.hit.has(m.id)) continue;
    if (Math.hypot(m.pos.x - p.pos.x, m.pos.y - p.pos.y) > m.radius + p.radius + 12) continue;
    p.dash.hit.add(m.id);
    const o = p.pendingShatter;
    const roll = rng.range(p.dmgMin, p.dmgMax) * o.mult * (1 + p.dmgBuff + (p.shrineDmg || 0));
    const crit = rng.chance(p.critChance / 100);
    hitMonster(game, m, {
      phys: crit ? roll * (p.critMult / 100) : roll,
      cold: p.coldDmg + o.cold, crit,
    });
    if (rng.chance(o.freeze / 100)) applyFreeze(m, 2);
    shake(5);
    p.swing = { t: 0, dur: 0.3, dir: p.dash.dir, arc: 1.8, reach: 70, kind: 'shatter', variant: 'thrust' };
    p.dash.t = 0;
    break;
  }
}

/**
 * Mantelns fysik: en dämpad fjäder som strävar mot motsatt håll än rörelsen.
 *
 * Tyget hinner aldrig ifatt kroppen, så det släpar efter när man springer och
 * pendlar tillbaka till vila när man stannar — underdämpat med flit, för ett
 * kritiskt dämpat tyg ser stelt ut. Fjädern lever i speltillståndet och inte i
 * renderaren, eftersom den måste integreras med samma dt som allt annat.
 *
 * @param {any} p @param {number} dt
 */
function updateCloak(p, dt) {
  const c = p.cloak;
  // Vilar tyget mot ryggen är utslaget noll; springer man dras fållen bakåt.
  let tx = -p.velX * 0.13, ty = -p.velY * 0.13;
  // Tak: en rullning eller ett krosshugg går i ~950 px/s, vilket annars skulle
  // slänga fållen 99 px åt sidan — långt utanför figuren. Riktningen behålls,
  // bara längden kapas, så utfallet fortfarande ger en tydlig flärp.
  const MAX = 26;
  const tl = Math.hypot(tx, ty);
  if (tl > MAX) { tx = tx / tl * MAX; ty = ty / tl * MAX; }
  const STIFF = 52, DAMP = 8.5;
  const h = Math.min(dt, 1 / 60);   // stabil integration även vid tapp
  let steps = Math.max(1, Math.ceil(dt / h));
  const sh = dt / steps;
  for (let i = 0; i < steps; i++) {
    c.vx += ((tx - c.x) * STIFF - c.vx * DAMP) * sh;
    c.vy += ((ty - c.y) * STIFF - c.vy * DAMP) * sh;
    c.x += c.vx * sh;
    c.y += c.vy * sh;
  }
}

/**
 * Undanrullning. Kort, billig och med en verklig avkylning — den ska vara ett
 * val i striden, inte ett andra sätt att gå.
 * @param {Game} game
 */
function dodgeRoll(game) {
  const p = game.player;
  if (p.roll || p.dash || p.whirl) return;
  if ((p.rollCd ?? 0) > 0) return;
  if (p.stamina < 16) { game.alert('För lite uthållighet för att rulla.'); return; }
  let mx = 0, my = 0;
  if (keyDown('arrowup')) my -= 1;
  if (keyDown('arrowdown')) my += 1;
  if (keyDown('arrowleft')) mx -= 1;
  if (keyDown('arrowright')) mx += 1;
  const dir = (mx || my) ? Math.atan2(my, mx) : p.facing;
  p.stamina -= 16;
  p.rollCd = 0.85;
  p.roll = { t: 0.28, dur: 0.28, dir };
  p.swing = null;
  burst(p.pos.x, p.pos.y + 6, 14, { color: '#e8f0fa', speed: 150, life: 0.5, size: 2.6, dir: dir + Math.PI, spread: 1.6 });
}

/** @param {any} p @param {number} dt */
function tickShrineBuffs(p, dt) {
  for (const k of /** @type {const} */ (['shrineDmg', 'armorBuff', 'speedBuff', 'xpBuff'])) {
    const tk = k + 'T';
    if ((p[tk] ?? 0) > 0) {
      p[tk] -= dt;
      if (p[tk] <= 0) { p[k] = 0; p[tk] = 0; }
    }
  }
}

/** @param {Game} game @param {any} s */
function activateShrine(game, s) {
  const p = game.player;
  s.used = true;
  burst(s.x, s.y - 18, 50, { color: '#d8e8ff', speed: 220, life: 1, size: 3, grav: -50 });
  screenFlash(0.2, '#7fd4f0');
  switch (s.kind) {
    case 'dmg': p.shrineDmg = 0.4; p.shrineDmgT = 45; game.alert('Helgedom: +40% skada i 45 s'); break;
    case 'armor': p.armorBuff = 0.6; p.armorBuffT = 45; game.alert('Helgedom: +60% rustning i 45 s'); break;
    case 'speed': p.speedBuff = 0.3; p.speedBuffT = 40; game.alert('Helgedom: +30% gånghastighet i 40 s'); break;
    case 'xp': p.xpBuff = 0.25; p.xpBuffT = 60; game.alert('Helgedom: +25% erfarenhet i 60 s'); break;
    case 'heal':
      p.hp = p.maxHp; p.stamina = p.maxStamina; p.mana = p.maxMana;
      floatText(p.pos.x, p.pos.y - 34, 'Återställd', '#7ce39a', 15);
      game.alert('Helgedom: helt återställd');
      break;
  }
  game.dirtyUI = true;
}

/**
 * Vad står spelaren i närheten av just nu? Samma funktion driver både
 * E-tangenten och prompten som ritas i världen, så de aldrig kan säga emot
 * varandra.
 * @param {Game} game
 * @returns {{kind:string, obj:any, x:number, y:number, label:string}|null}
 */
export function findInteract(game) {
  const p = game.player;
  const near = (/** @type {{x:number,y:number}} */ o, /** @type {number} */ r) =>
    Math.hypot(p.pos.x - o.x, p.pos.y - o.y) < r;

  // Portalen först — den ligger ofta ovanpå annat i byn.
  if (game.portal) {
    const here = game.zone.isTown ? game.portal.townPos
      : (game.zone.index === game.portal.zoneIndex ? game.portal.fromPos : null);
    if (here && near(here, 70)) {
      return { kind: 'portal', obj: here, x: here.x, y: here.y - 108,
        label: 'Res' };
    }
  }
  const wp = game.zone.waypoint;
  if (wp && near(wp, wp.r + 46)) {
    return { kind: 'waypoint', obj: wp, x: wp.x, y: wp.y - 108, label: 'Använd' };
  }
  for (const c of game.zone.chests) {
    if (!c.opened && near(c, c.r + 46)) {
      return { kind: 'chest', obj: c, x: c.x, y: c.y - 60, label: 'Öppna' };
    }
  }
  for (const e of game.zone.exits) {
    if (near(e, e.r + 34)) {
      return { kind: 'exit', obj: e, x: e.x, y: e.y - e.r * 0.5 - 40, label: 'Res' };
    }
  }
  for (const n of game.zone.npcs) {
    if (near(n, 115)) {
      return { kind: 'npc', obj: n, x: n.x, y: n.y - 64,
        label: n.id === 'gerd' ? 'Handla' : 'Tala' };
    }
  }
  return null;
}

/** @param {Game} game */
function interact(game) {
  const hit = findInteract(game);
  if (!hit) { game.alert('Inget att göra här.'); return; }
  const p = game.player;
  switch (hit.kind) {
    case 'portal':
      if (game.zone.isTown) returnThroughPortal(game);
      else {
        travel(game, 0, undefined, { keepPortal: true });
        if (game.portal) game.portal.townPos = townPortalPad(game);
      }
      break;
    case 'waypoint':
      game.waypoints.add(game.zone.index);
      panels.waypoint = true;
      game.dirtyUI = true;
      break;
    case 'chest': openChest(game, hit.obj); break;
    case 'exit': travel(game, hit.obj.to, game.zone.index); break;
    case 'npc':
      if (hit.obj.id === 'gerd') { panels.vendor = true; panels.inventory = true; game.dirtyUI = true; }
      else game.alert(`${hit.obj.name}: ${hit.obj.line}`);
      break;
  }
}

/** @param {Game} game @param {any} c */
function openChest(game, c) {
  const p = game.player;
  c.opened = true;
  const ilvl = game.zone.level + 3;
  const n = 3 + Math.floor(rng.range(0, 2.99));
  for (let i = 0; i < n; i++) {
    const item = rollItem(ilvl, { mf: p.magicFind, boost: 2.2 });
    if (item) spawnGround(game, c.x, c.y + 20, { kind: 'item', item });
  }
  spawnGround(game, c.x, c.y + 20, { kind: 'gold', amount: Math.round(40 + game.zone.level * 26 * rng.range(0.8, 1.6)) });
  burst(c.x, c.y - 10, 40, { color: '#d8b26a', speed: 200, life: 0.9, size: 3, grav: -30 });
  game.alert('Kistan var inte tom.');
  shake(4);
}

/** @param {Game} game @param {number} dt */
function updateGround(game, dt) {
  const p = game.player;
  let changed = false;
  for (let i = game.ground.length - 1; i >= 0; i--) {
    const g = game.ground[i];
    g.age += dt;
    if (g.pop > 0) g.pop -= dt;
    // Allt plockas upp automatiskt när man går över det. Föremål droppar
    // sällan nog att det inte blir skräpsamlande — och att stanna och klicka
    // på varje pinne var aldrig det roliga i D2.
    const reach = g.kind === 'item' ? p.radius + 42 : p.radius + 30;
    // Full väska: låt föremålet ligga kvar tyst i stället för att larma varje
    // bildruta man står ovanpå det. Etiketten finns kvar att klicka på.
    if (g.kind === 'item' && !canAdd(p.inventory, g.item)) continue;
    const d = Math.hypot(g.x - p.pos.x, g.y - p.pos.y);
    // Något du själv släppt armeras först när du gått ifrån det. Utan det gick
    // det inte att lägga ifrån sig ett vapen — det sögs upp direkt igen.
    if (g.armed === false) { if (d > reach + 26) g.armed = true; continue; }
    if (d < reach) {
      if (pickup(game, g)) { game.ground.splice(i, 1); changed = true; }
    }
  }
  if (changed) game.groundVersion++;
}

/** @param {Game} game @param {number} dt */
function updateNovas(game, dt) {
  for (let i = game.novas.length - 1; i >= 0; i--) {
    game.novas[i].t += dt;
    if (game.novas[i].t >= game.novas[i].dur) game.novas.splice(i, 1);
  }
}
