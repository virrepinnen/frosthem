// @ts-check
import { createPlayer, HOTBAR_SIZE, bindToHotbar, PORTAL_CAST, PORTAL_STEP } from './entities/player.js';
import { revealFog, ZONE_DEFS } from './systems/world.js';
import { createWorld, ensureZone, ensureAround, unloadFar, zoneAt, zonesNear, collide, losBlocked }
  from './systems/worldmap.js';
import { updateMonsters, updateProjectiles } from './systems/ai.js';
import { performSwing, useSkill, drinkPotion, hitMonster, applyFreeze, spawnGround,
  announceDrop } from './systems/combat.js';
import { pickup, canAdd } from './systems/inventory.js';
import { updateOrbs } from './systems/orbs.js';
import { updateAutoWeapons, resetAutoWeapons } from './systems/autoweapons.js';
import { rollItem } from './systems/loot.js';
import { SKILL_BY_ID } from './data/skills.js';
import { input, keyPressed, keyDown } from './core/input.js';
import { camera, updateCamera, toWorld } from './render/camera.js';
import { updateFx, clearFx, burst, floatText, screenFlash, shake } from './render/fx.js';
import { pushAlert, showOverlay, showLevelUp, hideLevelUp, levelUpOpen,
         showPauseMenu, hidePauseMenu, pauseMenuOpen, showZoneBanner,
         showInscription } from './ui/hud.js';
import { panels, togglePanel, closeAllPanels, anyPanelOpen } from './ui/panels.js';
import { startRun, endRun, markDepth, newRunStats } from './systems/run.js';
import { ZONE_LINE, npcLine, HRAVN } from './data/lore.js';
import { T } from './systems/tuning.js';
import { hideTooltip } from './ui/tooltip.js';
import { toggleTuner } from './ui/tuner.js';
import { saveGame } from './systems/save.js';
import { COMBAT_WINDOW, recalc } from './systems/stats.js';
import { rng } from './core/rng.js';
import { clamp } from './core/math.js';


/**
 * Central game state + update loop.
 * @param {ReturnType<typeof createPlayer>} [existing] A loaded character, otherwise new
 * @param {{zoneIndex?:number, bossDefeated?:boolean, charId?:string}} [progress]
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
    /** How many runs this character has finished, and the deepest map reached. */
    runs: progress?.runs ?? 0,
    bestDepth: progress?.bestDepth ?? 0,
    runNo: 0,
    /** True in the test session: nothing saves, death does not end anything. */
    testMode: false,
    tunerOpen: false,
    /** @type {ReturnType<typeof newRunStats>} */ run: newRunStats(),
    /** Maps whose arrival line has already played this run. @type {Set<number>} */
    seen: new Set(),
    /** @type {string|undefined} The save slot's id; set on the first save. */
    charId: progress?.charId,
    /** Which map the player is standing on. */
    zoneIndex: 0,
    victoryT: 3,
    /** @type {null|{zoneIndex:number, zoneName:string, fromPos:{x:number,y:number}, townPos:{x:number,y:number}|null, stash:any}} */
    portal: null,
    skillDefs: SKILL_BY_ID,
    aim: { x: 0, y: 0 },
    /** @type {any} */ aimTarget: null,
    /** @type {any} */ interact: null,
    /**
     * The act as one surface. Holds the map you are standing on and the ones on
     * either side, all placed in the same coordinate system, so a border is a
     * line you walk over rather than something that happens to you.
     */
    world: createWorld(),
    /** The screen's darkening 0..1 during a zone change. */
    veil: 0,
    time: 0,
    paused: false,
    saveT: 0,
    settings: { autoAim: true, autoAttack: true },
    /** @type {'steel'|'frost'|'endurance'} */ skillTab: 'steel',
    /** True while the skill panel is open *as the shop*, at the hearth. */
    atHearth: false,

    /** @param {string} t */
    alert(t) { pushAlert(t); },
    /**
     * Levelling now happens when orbs are swept up, not in the combat loop —
     * so the window appears when you collect the haul, not mid-swing.
     * @param {number} levels
     */
    onLevelUp(levels) {
      const p = game.player;
      burst(p.pos.x, p.pos.y, 90, { color: '#ffd88a', speed: 300, life: 1.4, size: 3.4, grav: -70 });
      burst(p.pos.x, p.pos.y, 30, { color: '#fff3d0', speed: 120, life: 1.8, size: 2.2, grav: -110 });
      floatText(p.pos.x, p.pos.y - 62, `LEVEL ${p.level}`, '#ffd88a', 26);
      screenFlash(0.34, '#d8b26a');
      shake(7);
      void levels;   // the count lives on the player, as boonPicks
    },
    /** @param {string} id */
    tryUseSkill(id) { if (useSkill(game, id)) game.dirtyUI = true; },
    tryDrink() { drinkPotion(game); game.dirtyUI = true; },
    /** @param {any} g */
    tryPickup(g) {
      if (Math.hypot(g.x - game.player.pos.x, g.y - game.player.pos.y) > 190) { game.alert('Too far away.'); return; }
      if (pickup(game, g)) { game.ground.splice(game.ground.indexOf(g), 1); game.groundVersion++; }
    },
    /** @param {number} to @param {number} [from] */
    travel(to, from) { travel(game, to, from); },
    save() {
      if (game.testMode) { game.alert('Test session — nothing is saved.'); return false; }
      const ok = saveGame(game); if (ok) game.alert('Saved.'); return ok;
    },
    /** The tuning panel changes stats live; this puts them into effect. */
    recalcPlayer() { recalc(game.player); game.dirtyUI = true; },
    /** Starts a fresh run with the same character. Gear and gold stay. */
    beginRun() {
      startRun(game);
      game.seen.clear();
      game.bossDefeated = false;
      travel(game, 0);
      game.alert(`${game.player.name} sets out again.`);
      saveGame(game);
    },
    /** @param {string} id Moves a skill to the next hotbar slot. */
    bindNext(id) { bindToHotbar(game.player, id, true); game.dirtyUI = true; },
    /** Kept for the panels' close handlers; there is nothing pending any more. */
    dropPending() {},
    togglePause() {
      if (pauseMenuOpen()) { hidePauseMenu(); game.paused = false; }
      else { game.paused = true; showPauseMenu(game); }
    },
    autosave() { if (!game.testMode) game.saveT = 0.6; },
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
 * Put the player somewhere in the act, and build the world around that spot.
 *
 * This is no longer how you get from one map to the next — you walk there now.
 * What is left is the handful of jumps that really are jumps: starting a run,
 * stepping through a town portal, and the development panel's map buttons.
 * @param {Game} game @param {number} to @param {number} [from]
 * @param {{at?:{x:number,y:number}, keepPortal?:boolean}} [opts]
 */
function travel(game, to, from, opts = {}) {
  const idx = clamp(to, 0, ZONE_DEFS.length - 1);

  game.world = createWorld();
  game.monsters = [];
  resetAutoWeapons(game);
  game.ground = [];
  game.projectiles = [];
  game.novas = [];
  game.orbs = [];
  const zone = ensureZone(game.world, idx);
  game.zone = zone;
  game.groundVersion++;
  game.victoryT = 3;
  clearFx();

  // An open portal only survives travel between its own two endpoints.
  if (!opts.keepPortal && game.portal && idx !== 0 && idx !== game.portal.zoneIndex) {
    game.portal = null;
    game.alert('The portal closed behind you.');
  }

  const p = game.player;
  let spawn = opts.at ?? { ...zone.entry };
  if (!opts.at && from !== undefined) {
    const back = zone.exits.find((/** @type {any} */ e) => e.to === from);
    // A little inside the threshold, or the first step would send you straight
    // back out. Measured inward along the border's own normal.
    if (back) spawn = { x: back.tx - back.dirX * 132, y: back.ty - back.dirY * 132 };
  }
  p.pos.x = spawn.x; p.pos.y = spawn.y;
  p.vel.x = p.vel.y = 0;
  p.swing = null; p.dash = null; p.whirl = null; p.cast = null;

  // The neighbours are built now, before the first frame, so the ground on the
  // far side of a border is already there the moment you can see it.
  ensureAround(game.world, idx);
  syncMonsters(game);
  collide(game.world, p.pos, p.radius);

  camera.x = p.pos.x - camera.w / 2;
  camera.y = p.pos.y - camera.h / 2;

  game.zoneIndex = idx;
  announceZone(game, zone);
  markDepth(game, idx);
  if (zone.isTown) { p.hp = p.maxHp; p.mana = p.maxMana; }
  game.dirtyUI = true;
  hideTooltip();
  game.autosave();
}

/**
 * The name over the screen when you set foot somewhere new.
 * @param {Game} game @param {any} zone
 */
function announceZone(game, zone) {
  // The banner names the map; the line under it names the area, so the chain
  // reads as one journey rather than nine unrelated places.
  showZoneBanner(zone.name, zone.isTown
    ? 'the hearth still burns'
    : `${zone.area} · monster level ${zone.level}`);
  // The place says one thing about itself as you arrive, a beat after the name.
  // Once per run per map: a line you have read four times stops being a line.
  if (!game.seen.has(zone.index)) {
    game.seen.add(zone.index);
    const line = ZONE_LINE[zone.index];
    if (line) setTimeout(() => showInscription(line), 900);
  }
}

/**
 * Brings the live monster list in line with the maps that are loaded.
 *
 * Monsters are made with their map and stay tagged with it, so that dropping a
 * map you have walked away from takes its monsters with it — and so that the
 * one list the rest of the game works from stays a single flat array.
 * @param {Game} game
 */
function syncMonsters(game) {
  for (const z of game.world.zones.values()) {
    if (!z.monsters) continue;
    for (const m of z.monsters) { m.zoneIndex = z.index; game.monsters.push(m); }
    z.monsters = null;
  }
  const live = game.world.zones;
  if (game.monsters.some((/** @type {any} */ m) => !live.has(m.zoneIndex))) {
    game.monsters = game.monsters.filter((/** @type {any} */ m) => live.has(m.zoneIndex));
  }
}

/**
 * Which map are we standing on?
 *
 * Called every frame. Crossing a border is nothing more than this answer
 * changing: there is no fade, no pause and nothing to load, because the ground
 * you just stepped onto was built while you were walking towards it.
 * @param {Game} game
 */
function updateWorldAround(game) {
  const p = game.player;
  const here = zoneAt(game.world, p.pos.x, p.pos.y);
  if (here && here.index !== game.zoneIndex) {
    game.zoneIndex = here.index;
    game.zone = here;
    announceZone(game, here);
    markDepth(game, here.index);
    if (here.isTown) { p.hp = p.maxHp; p.mana = p.maxMana; }
    game.dirtyUI = true;
    game.autosave();
  }
  ensureAround(game.world, game.zoneIndex);
  if (unloadFar(game.world, game.zoneIndex, p.pos.x, p.pos.y)) game.dirtyUI = true;
  syncMonsters(game);
}



/**
 * Town portal: a there-and-back shortcut that preserves the zone you left,
 * including monsters and loot on the ground. Without that preservation the
 * portal would be worthless, since zones are otherwise regenerated on entry.
 * @param {Game} game
 */
function openTownPortal(game) {
  const p = game.player;
  if (game.zone.isTown) {
    if (game.portal) { returnThroughPortal(game); return; }
    game.alert('You are already in Frosthem.');
    return;
  }
  if (p.cast) return;
  p.cast = { t: 0, x: p.pos.x, y: p.pos.y };
  game.alert('Opening a portal to Frosthem…');
}

/** @param {Game} game @param {string} why */
function cancelPortalCast(game, why) {
  const p = game.player;
  if (!p.cast) return;
  burst(p.cast.x, p.cast.y - 8, 16, { color: '#7a8ea0', speed: 130, life: 0.5, size: 2.4 });
  p.cast = null;
  game.alert(why);
}

/** Completes the portal and travels. @param {Game} game */
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
  game.alert(`Portal opened to ${game.portal.zoneName}. Press E at it to travel back.`);
}

/**
 * Ticks the cast. Movement breaks it while charging, but during the opening
 * phase you are committed — the step has already been taken.
 * @param {Game} game @param {number} dt @param {boolean} moving
 * @returns {boolean} true if the cast locks out other actions
 */
function updatePortalCast(game, dt, moving) {
  const p = game.player;
  if (!p.cast) return false;
  const stepping = p.cast.t >= PORTAL_CAST - PORTAL_STEP;
  if (moving && !stepping) { cancelPortalCast(game, 'You moved — the portal broke.'); return false; }

  p.cast.t += dt;
  if (stepping) {
    // The figure slides into the gate during the last half second.
    p.pos.x += (p.cast.x - p.pos.x) * Math.min(1, dt * 9);
    p.pos.y += (p.cast.y - p.pos.y) * Math.min(1, dt * 9);
    if (rng.chance(0.6)) {
      burst(p.cast.x, p.cast.y - 12, 2, { color: '#a8e4f8', speed: 90, life: 0.5, size: 2.4, grav: -60 });
    }
    if (p.cast.t >= PORTAL_CAST) { finishTownPortal(game); return true; }
  } else if (rng.chance(0.5)) {
    // the energy is drawn inward towards the feet while charging
    const a = rng.range(0, Math.PI * 2), rad = rng.range(42, 72);
    burst(p.cast.x + Math.cos(a) * rad, p.cast.y + Math.sin(a) * rad, 1,
      { color: '#8fd8f4', speed: 18, life: 0.6, size: 2.2, grav: -8 });
  }
  return true;
}

/** The village's portal pad, with a safe fallback if the zone lacks one. @param {Game} game */
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
  game.alert('Back in the wilderness.');
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

/** @param {Game} game @param {number} dt */
function update(game, dt) {
  const p = game.player;

  game.aim = toWorld(input.mouse.x, input.mouse.y);
  handleUiKeys(game);

  if (game.saveT > 0) {
    game.saveT -= dt;
    if (game.saveT <= 0) saveGame(game);
  }

  // Nothing darkens the screen any more: a border is walked over, not loaded
  // through. The element stays so a future fade has somewhere to live.
  if (game.veil > 0) game.veil = Math.max(0, game.veil - dt / 0.28);
  // An open panel stops the world. The bag now covers half the screen, so
  // fighting behind it was never really an option — freezing makes that honest,
  // and it means reading a tooltip is never punished by something biting you.
  if (game.paused || game.tunerOpen || anyPanelOpen()) { updateFx(dt); return; }

  game.time += dt;

  game.playerSlow = 0;
  revealFog(game.zone, p.pos.x, p.pos.y);
  updatePlayer(game, dt);
  updateAutoWeapons(game, dt);
  updateMonsters(game, dt);
  updateProjectiles(game, dt);
  updateGround(game, dt);
  updateOrbs(game, dt);
  updateNovas(game, dt);
  updateFx(dt);
  updateCamera(game, dt);

  // A card is owed whenever a level was gained. The window deals a fresh hand
  // per pick, so several levels at once still resolve in a click each.
  if (game.player.boonPicks > 0 && !game.paused && !levelUpOpen()) {
    game.paused = true;
    saveGame(game);
    showLevelUp(game, game.player.boonPicks);
  }

  if (!game.bossDefeated && game.zone.bossAt) {
    const boss = game.monsters.find(m => m.isBoss && !m.dead);
    if (!boss) game.victoryT -= dt;
    if (!boss && game.victoryT <= 0) {
      game.bossDefeated = true;
      game.paused = true;
      const summary = endRun(game, 'victory');
      saveGame(game);
      showOverlay('Hravn has fallen', runSummary(game, summary),
        'Set out again',
        () => {
          startRun(game);
          game.bossDefeated = false;
          game.paused = false;
          travel(game, 0);
          saveGame(game);
        });
    }
  }
}

/**
 * The run summary. Deliberately reads as a receipt rather than a scolding: the
 * top line is what you are bringing home, because that is the part that makes
 * the next attempt start further along than this one did.
 * @param {Game} game @param {ReturnType<typeof endRun>} s
 */
function runSummary(game, s) {
  const p = game.player;
  const carried = p.inventory.length + Object.values(p.equipment).filter(Boolean).length;
  const head = s.cause === 'victory' ? HRAVN.fall
    : 'The cold took you. Gerd drags you back to the hearth — with everything you were carrying.';
  // The place you reached gets its own line: it is the headline of the run, and
  // a long name like "Den frusna graven" wrapped to three lines when it had to
  // share a row with the numbers.
  return `<p>${head}</p>` +
    `<div class="sum-depth"><i>as far as you got</i><b>${s.depthName}</b></div>` +
    '<div class="sum">' +
    `<div><b>${s.level}</b><i>level reached</i></div>` +
    `<div><b>${s.kills}</b><i>felled</i></div>` +
    `<div><b>${s.gold}</b><i>gold carried home</i></div>` +
    '</div>' +
    `<p class="sum-note">You keep <b>${p.gold} gold</b>, <b>${carried} items</b> and every skill rank ` +
    'you have bought. The level and the blessings start over.' +
    (s.record ? '<br><b>Deepest yet.</b>' : ` Deepest so far: <b>${s.bestName}</b>.`) +
    '</p>';
}

/** @param {Game} game */
function handleUiKeys(game) {
  if (keyPressed('f3')) toggleTuner(game);
  if (keyPressed('i')) togglePanel(game, 'inventory');
  if (keyPressed('c')) togglePanel(game, 'character');
  if (keyPressed('k')) togglePanel(game, 'skills');
  if (keyPressed('f5')) game.save();
  if (keyPressed('escape')) {
    // Esc first clears whatever lies on top, and only pauses once the screen is
    // clean.
    // Esc on the card window skips the pick, exactly like the Skip button.
    // Merely hiding it would not do: the loop would deal a new hand next frame.
    if (levelUpOpen()) {
      game.player.boonPicks = 0;
      hideLevelUp(); closeAllPanels(game); game.paused = false;
    }
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
      // A test session never ends: back on your feet where you stood, so you
      // can look at the same fight twenty times without any ceremony.
      if (game.testMode) {
        p.dead = false; p.deathT = 0;
        p.hp = p.maxHp; p.mana = p.maxMana;
        p.potions = Math.max(p.potions, 3);
        p.swing = null; p.dash = null; p.whirl = null; p.cast = null;
        p.invuln = 1.5;
        game.alert('Down. Back up — test session.');
        return;
      }
      game.paused = true;
      p.deaths++;
      const summary = endRun(game, 'death');
      saveGame(game);
      showOverlay('You fell in the snow', runSummary(game, summary),
        'Set out again',
        () => {
          p.swing = null; p.dash = null; p.whirl = null; p.cast = null;
          game.portal = null;
          startRun(game);
          game.paused = false;
          travel(game, 0);
          saveGame(game);
        });
    }
    return;
  }

  // ---- timers --------------------------------------------------------------
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.attackTimer = Math.max(0, p.attackTimer - dt);
  p.rollCd = Math.max(0, (p.rollCd ?? 0) - dt);
  p.potionCd = Math.max(0, (p.potionCd ?? 0) - dt);
  for (const k in p.cooldowns) if (p.cooldowns[k] > 0) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
  if (p.dmgBuffT > 0) { p.dmgBuffT -= dt; if (p.dmgBuffT <= 0) p.dmgBuff = 0; }
  if (p.slamSlowT > 0) { p.slamSlowT -= dt; game.playerSlow = Math.max(game.playerSlow, 0.45); }
  tickShrineBuffs(p, dt);
  if (p.swing) { p.swing.t += dt; if (p.swing.t >= p.swing.dur) p.swing = null; }

  p.hp = Math.min(p.maxHp, p.hp + p.lifeRegen * dt);
  p.combatT = Math.max(0, (p.combatT ?? 0) - dt);
  p.mana = Math.min(p.maxMana, p.mana + p.manaRegen * dt);
  p.manaFlash = Math.max(0, (p.manaFlash ?? 0) - dt);

  // ---- movement ------------------------------------------------------------
  const wasX = p.pos.x, wasY = p.pos.y;
  let mx = 0, my = 0;
  // Arrow keys only. WASD is removed on purpose: the left hand belongs to 1–6
  // and Q, not competing with movement.
  if (keyDown('arrowup')) my -= 1;
  if (keyDown('arrowdown')) my += 1;
  if (keyDown('arrowleft')) mx -= 1;
  if (keyDown('arrowright')) mx += 1;
  // Saved for the zone border: it wants to know that *you* are walking outward.
  p.inX = mx; p.inY = my;

  // ---- sikte ---------------------------------------------------------------
  // With auto-aim the right hand only has to handle movement: the figure turns
  // towards the nearest enemy in line of sight, otherwise the way it is walking.
  updateAiming(game, mx, my);

  // While casting the portal you stand still and can do nothing else.
  const casting = updatePortalCast(game, dt, !!(mx || my));
  if (casting) { mx = 0; my = 0; }

  let speed = p.moveSpeed * (1 - game.playerSlow) * (1 + (p.speedBuff || 0));
  if (p.whirl) speed *= 1.3;

  if (p.roll) {
    // The roll grants invulnerability in the middle of the motion, not at the
    // start and end — it should reward timing, not be a button you hold.
    p.roll.t -= dt;
    const k = 1 - p.roll.t / p.roll.dur;
    const ease = 1 - Math.pow(k, 2.2);
    // The knob is the distance actually travelled. The roll decelerates on the
    // curve below, whose integral over the whole motion is 1 - 1/3.2, so the
    // speed has to be divided by that for the number to mean pixels. It did not
    // before, and a slider that lies is worse than no slider.
    const rollSpeed = T.rollDist / (Math.max(0.05, p.roll.dur) * 0.6875);
    p.pos.x += Math.cos(p.roll.dir) * rollSpeed * ease * dt;
    p.pos.y += Math.sin(p.roll.dir) * rollSpeed * ease * dt;
    // The invulnerable window sits in the middle of the motion, so the roll
    // rewards timing rather than being a button you hold.
    const half = T.rollIframes / 2;
    if (k > 0.5 - half && k < 0.5 + half) p.invuln = Math.max(p.invuln, 0.05);
    if (rng.chance(0.6)) burst(p.pos.x, p.pos.y + 8, 2, { color: '#e8f0fa', speed: 60, life: 0.4, size: 2.4, grav: -10 });
    collide(game.world, p.pos, p.radius);
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
    // The cloak trails towards where you came from, not straight backwards.
    p.moveAngle = Math.atan2(my, mx);
    p.moving = true;
  } else {
    p.moving = false;
  }
  // The lean into a swing. Applied after the walk and before the world gets a
  // say, so a rock still stops you.
  if (p.step) {
    p.step.t -= dt;
    if (p.step.t <= 0) p.step = null;
    else {
      const k = (dt / p.step.dur) * (p.step.t / p.step.dur) * 2;
      p.pos.x += Math.cos(p.step.dir) * p.step.dist * k;
      p.pos.y += Math.sin(p.step.dir) * p.step.dist * k;
    }
  }
  collide(game.world, p.pos, p.radius);

  // Velocity is measured from the actual movement — so it holds equally for
  // walking, dashing, rolling and being stopped by a wall.
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
  // Auto-attack: if an enemy stands within reach you strike on your own. The
  // mouse is not needed at all — but it still works as a manual trigger.
  if (!anyPanelOpen() && !casting && !p.whirl && !p.dash && !p.roll && p.attackTimer <= 0) {
    const t = game.aimTarget;
    // Auto-attack never touches anything dormant: walking up to the jarl should
    // not start the fight for you. To wake him, you have to click.
    const inReach = t && !t.dead && !t.dormant
      && Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) <= T.reach + t.radius;
    // And it holds entirely when the screen is empty. Swinging at nothing on
    // the walk between packs makes the character look like it is malfunctioning.
    const wants = input.mouse.down
      || (game.settings.autoAttack && inReach && enemyOnScreen(game));
    if (wants) {
      p.combatT = COMBAT_WINDOW;
      p.attackTimer = 1 / (1.5 * p.attackSpeed);
      performSwing(game, { arc: 1.5, reach: T.reach, mult: 1, kind: 'basic' });
      // A step into the blow, so striking and closing are one motion instead of
      // two. It is short and it decays, so it reads as leaning in rather than as
      // being moved — and it never fights the arrow keys, because it is added to
      // wherever you were already going.
      if (T.swingStep > 0) p.step = { t: 0.16, dur: 0.16, dir: p.facing, dist: T.swingStep };
    }
  }
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    if (keyPressed(String(i + 1))) {
      const id = p.hotbar[i];
      if (id && !casting) game.tryUseSkill(id);
    }
  }
  if (keyPressed('q') && !casting) game.tryDrink();
  if (keyPressed(' ') && !casting) dodgeRoll(game);
  if (keyPressed('t')) {
    if (p.cast) cancelPortalCast(game, 'You cancelled the portal.');
    else openTownPortal(game);
  }
  if (keyPressed('e') && !casting) interact(game);

  // ---- places you walk into ------------------------------------------------
  // Across every map you are near, not just the one underfoot: standing on a
  // seam, half of what is in reach belongs to the map next door.
  for (const s of zonesNear(game.world, p.pos.x, p.pos.y, 400).flatMap(z => z.shrines)) {
    if (s.used) continue;
    if (Math.hypot(p.pos.x - s.x, p.pos.y - s.y) > s.r + p.radius) continue;
    activateShrine(game, s);
  }
  // Walk away from the hearth and the shop closes itself, the same way the
  // trade does. A panel you have already left should not need dismissing.
  if (game.atHearth) {
    const h = zone.obstacles.find(o => o.type === 'hearth');
    if (!h || Math.hypot(p.pos.x - /** @type {any} */ (h).x, p.pos.y - /** @type {any} */ (h).y) > 170) {
      game.atHearth = false;
      panels.skills = false;
      game.dirtyUI = true;
    }
  }
  if (panels.vendor) {
    const gerd = zone.npcs.find(n => n.id === 'gerd');
    if (!gerd || Math.hypot(p.pos.x - gerd.x, p.pos.y - gerd.y) > 190) {
      panels.vendor = false;
      panels.inventory = false;
      game.dirtyUI = true;
    }
  }
  game.interact = findInteract(game);

  updateWorldAround(game);

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
    if (losBlocked(game.world, p.pos.x, p.pos.y, m.pos.x, m.pos.y)) continue;
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
 * The cloak's physics: a damped spring reaching opposite to the movement.
 *
 * The cloth never catches up with the body, so it trails while running and
 * swings back to rest when you stop — underdamped on purpose, because critically
 * damped cloth looks stiff. The spring lives in the game state rather than the
 * renderer, because it has to integrate with the same dt as everything else.
 *
 * @param {any} p @param {number} dt
 */
function updateCloak(p, dt) {
  const c = p.cloak;
  // At rest against the back the deflection is zero; running drags the hem back.
  let tx = -p.velX * 0.13, ty = -p.velY * 0.13;
  // Cap: a roll or a crushing blow moves at ~950 px/s, which would otherwise
  // throw the hem 99 px sideways — far outside the figure. The direction is
  // kept and only the length clipped, so the lunge still gives a clear flare.
  const MAX = 26;
  const tl = Math.hypot(tx, ty);
  if (tl > MAX) { tx = tx / tl * MAX; ty = ty / tl * MAX; }
  const STIFF = 52, DAMP = 8.5;
  const h = Math.min(dt, 1 / 60);   // stable integration even on a dropped frame
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
 * Dodge roll. Short, cheap and with a real cooldown — it should be a real
 * choice in a fight, not a second way to walk.
 * @param {Game} game
 */
function dodgeRoll(game) {
  const p = game.player;
  if (p.roll || p.dash || p.whirl) return;
  if ((p.rollCd ?? 0) > 0) return;
  let mx = 0, my = 0;
  if (keyDown('arrowup')) my -= 1;
  if (keyDown('arrowdown')) my += 1;
  if (keyDown('arrowleft')) mx -= 1;
  if (keyDown('arrowright')) mx += 1;
  const dir = (mx || my) ? Math.atan2(my, mx) : p.facing;
  p.rollCd = T.rollCd;
  p.roll = { t: T.rollTime, dur: T.rollTime, dir };
  p.swing = null;
  burst(p.pos.x, p.pos.y + 6, 14, { color: '#e8f0fa', speed: 150, life: 0.5, size: 2.6, dir: dir + Math.PI, spread: 1.6 });
}

/**
 * Is there anything alive to fight within view?
 *
 * The camera's rectangle, not a radius: what the player can see is exactly what
 * should decide whether the character keeps swinging.
 * @param {Game} game
 */
function enemyOnScreen(game) {
  const pad = 40;
  for (const m of game.monsters) {
    if (m.dead || m.dormant) continue;
    if (m.pos.x < camera.x - pad || m.pos.x > camera.x + camera.w + pad) continue;
    if (m.pos.y < camera.y - pad || m.pos.y > camera.y + camera.h + pad) continue;
    return true;
  }
  return false;
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
    case 'dmg': p.shrineDmg = 0.4; p.shrineDmgT = 45; game.alert('Shrine: +40% damage for 45 s'); break;
    case 'armor': p.armorBuff = 0.6; p.armorBuffT = 45; game.alert('Shrine: +60% armour for 45 s'); break;
    case 'speed': p.speedBuff = 0.3; p.speedBuffT = 40; game.alert('Shrine: +30% movement speed for 40 s'); break;
    case 'xp': p.xpBuff = 0.25; p.xpBuffT = 60; game.alert('Shrine: +25% experience for 60 s'); break;
    case 'heal':
      p.hp = p.maxHp; p.mana = p.maxMana;
      floatText(p.pos.x, p.pos.y - 34, 'Restored', '#7ce39a', 15);
      game.alert('Shrine: fully restored');
      break;
  }
  game.dirtyUI = true;
}

/**
 * What is the player standing next to right now? The same function drives both
 * the E key and the prompt drawn in the world, so they can never contradict
 * varandra.
 * @param {Game} game
 * @returns {{kind:string, obj:any, x:number, y:number, label:string}|null}
 */
export function findInteract(game) {
  const p = game.player;
  const near = (/** @type {{x:number,y:number}} */ o, /** @type {number} */ r) =>
    Math.hypot(p.pos.x - o.x, p.pos.y - o.y) < r;

  // The portal first — it often sits on top of other things in the village.
  if (game.portal) {
    const here = game.zone.isTown ? game.portal.townPos
      : (game.zone.index === game.portal.zoneIndex ? game.portal.fromPos : null);
    if (here && near(here, 70)) {
      return { kind: 'portal', obj: here, x: here.x, y: here.y - 108,
        label: 'Travel' };
    }
  }
  // The hearth is where the skill trees are bought. Putting the shop on the
  // fire rather than on a menu keeps the village a place you go to.
  const hearth = game.zone.isTown
    ? game.zone.obstacles.find(o => o.type === 'hearth') : null;
  if (hearth && near(/** @type {any} */ (hearth), 104)) {
    return { kind: 'hearth', obj: hearth, x: /** @type {any} */ (hearth).x,
      y: /** @type {any} */ (hearth).y - 96, label: 'Train' };
  }
  const around = zonesNear(game.world, game.player.pos.x, game.player.pos.y, 400);
  for (const c of around.flatMap((/** @type {any} */ z) => z.chests)) {
    if (!c.opened && near(c, c.r + 46)) {
      return { kind: 'chest', obj: c, x: c.x, y: c.y - 60, label: 'Open' };
    }
  }
  for (const n of around.flatMap((/** @type {any} */ z) => z.npcs)) {
    if (near(n, 115)) {
      return { kind: 'npc', obj: n, x: n.x, y: n.y - 64,
        label: n.id === 'gerd' ? 'Trade' : 'Talk' };
    }
  }
  return null;
}

/** @param {Game} game */
function interact(game) {
  const hit = findInteract(game);
  if (!hit) { game.alert('Nothing to do here.'); return; }
  const p = game.player;
  switch (hit.kind) {
    case 'portal':
      if (game.zone.isTown) returnThroughPortal(game);
      else {
        travel(game, 0, undefined, { keepPortal: true });
        if (game.portal) game.portal.townPos = townPortalPad(game);
      }
      break;
    case 'chest': openChest(game, hit.obj); break;
    case 'hearth':
      game.atHearth = true;
      panels.skills = true;
      game.dirtyUI = true;
      break;
    case 'npc':
      if (hit.obj.id === 'gerd') { panels.vendor = true; panels.inventory = true; game.dirtyUI = true; }
      else showInscription(`${hit.obj.name}\n"${npcLine(hit.obj.id, game.bestDepth ?? 0)}"`);
      break;
  }
}

/** @param {Game} game @param {any} c */
function openChest(game, c) {
  const p = game.player;
  c.opened = true;
  const ilvl = game.zone.level + 3;
  // Chests are the one place white items still appear: a chest that spills
  // three things reads as a find even when one of them is plain.
  const n = 3 + Math.floor(rng.range(0, 2.99));
  for (let i = 0; i < n; i++) {
    const item = rollItem(ilvl, { mf: p.magicFind, boost: 2.6 });
    if (!item) continue;
    spawnGround(game, c.x, c.y + 20, { kind: 'item', item });
    announceDrop(game, item, c.x, c.y + 20);
  }
  spawnGround(game, c.x, c.y + 20, { kind: 'gold', amount: Math.round(70 + game.zone.level * 34 * rng.range(0.8, 1.6)) });
  burst(c.x, c.y - 10, 40, { color: '#d8b26a', speed: 200, life: 0.9, size: 3, grav: -30 });
  game.alert('The chest was not empty.');
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
    // Everything is picked up automatically as you walk over it. Items drop
    // rarely enough that it never becomes hoarding — and stopping to click every
    // twig was never the fun part of D2.
    const reach = g.kind === 'item' ? p.radius + 42 : p.radius + 30;
    // Full bag: leave the item lying there quietly instead of alerting every
    // frame you stand on it. The label is still there to click.
    if (g.kind === 'item' && !canAdd(p.inventory, g.item)) continue;
    const d = Math.hypot(g.x - p.pos.x, g.y - p.pos.y);
    // Something you dropped yourself is only armed once you have walked away.
    // Without that you could not put a weapon down — it was sucked straight back.
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
