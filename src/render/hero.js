// @ts-check
import { rng } from '../core/rng.js';
import { PROJ } from './camera.js';

/** Figuren står på den hoptryckta marken men ritas i oförminskade pixlar. */
const PY = (/** @type {number} */ y) => y * PROJ;

/**
 * Barbaren — riggad figur sedd uppifrån.
 *
 * Spelet är top-down, så "hukad framåt" kan inte visas med en profil. I stället
 * bär silhuetten berättelsen: kåpan sitter *framför* axelmassan, manteln sveper
 * bakåt som en droppe, och trasorna hänger som lösa remsor längs bakkanten.
 * Allt ritas i figurens eget rum där +x är blickriktningen.
 *
 * Ingen bilddata — figuren är ritad i banor och animeras av tillståndet. Det gör
 * att den kan ta färg av vapnets sällsynthet, blinka vid träff och byta hugg
 * utan att någon spritesheet behöver ritas om.
 */

const C = {
  silhouette: 'rgba(7,11,18,0.95)',
  cloakDark: '#152636',
  cloakMid: '#22415a',
  cloakLit: '#35617a',
  leather: '#54412b',
  leatherLit: '#6b543a',
  strap: '#c9a256',
  pauldron: '#7d848f',
  pauldronLit: '#9aa2ae',
  hood: '#3d647e',
  hoodLit: '#537f9a',
  hoodInner: '#070c12',
  face: '#b89772',
  boot: '#2b2218',
  haft: '#5d472f',
};

/* ------------------------------------------------------------------ */
/* Hugg-varianter                                                      */
/* ------------------------------------------------------------------ */

const easeOut = (/** @type {number} */ k) => 1 - Math.pow(1 - k, 3);
const easeIn = (/** @type {number} */ k) => k * k;
/** @param {number} a @param {number} b @param {number} k */
const mix = (a, b, k) => a + (b - a) * k;

/**
 * Varje variant beskriver vapnets väg genom hugget: vinkel, räckvidd, hur
 * kroppen vrids och hur långt den kastar sig fram. Uppladdningen ligger i de
 * första ~30% — utan den ser slaget ut att komma från ingenstans.
 *
 * @typedef {(k:number) => {ang:number, reach:number, twist:number, lunge:number}} Pose
 * @type {Record<string, {pose:Pose, trail:string}>}
 */
export const ATTACKS = {
  // Forehand: sveper från höger till vänster.
  slash: {
    trail: '#eaf3ff',
    pose: (k) => k < 0.28
      ? { ang: mix(-0.55, 1.35, easeOut(k / 0.28)), reach: mix(20, 23, k / 0.28),
          twist: mix(0, -0.34, k / 0.28), lunge: 0 }
      : { ang: mix(1.35, -1.5, easeOut((k - 0.28) / 0.72)),
          reach: 22 + mix(23, 34, Math.sin((k - 0.28) / 0.72 * Math.PI)),
          twist: mix(-0.34, 0.28, easeOut((k - 0.28) / 0.72)),
          lunge: Math.sin((k - 0.28) / 0.72 * Math.PI) * 3 },
  },
  // Backhand: samma svep tillbaka, så två slag i rad aldrig ser lika ut.
  backhand: {
    trail: '#e6f0ff',
    pose: (k) => k < 0.28
      ? { ang: mix(-0.55, -1.4, easeOut(k / 0.28)), reach: mix(20, 23, k / 0.28),
          twist: mix(0, 0.3, k / 0.28), lunge: 0 }
      : { ang: mix(-1.4, 1.45, easeOut((k - 0.28) / 0.72)),
          reach: 21 + mix(23, 33, Math.sin((k - 0.28) / 0.72 * Math.PI)),
          twist: mix(0.3, -0.26, easeOut((k - 0.28) / 0.72)),
          lunge: Math.sin((k - 0.28) / 0.72 * Math.PI) * 2.5 },
  },
  // Överhugg: vapnet dras runt bakifrån och faller rakt ner i mitten.
  overhead: {
    trail: '#fff3d6',
    pose: (k) => k < 0.34
      ? { ang: mix(-0.55, 2.5, easeOut(k / 0.34)), reach: mix(20, 15, k / 0.34),
          twist: mix(0, -0.2, k / 0.34), lunge: -2 }
      : { ang: mix(2.5, 0.02, easeIn((k - 0.34) / 0.66)),
          reach: mix(15, 44, easeOut((k - 0.34) / 0.66)),
          twist: mix(-0.2, 0.1, (k - 0.34) / 0.66),
          lunge: mix(-2, 6, easeOut((k - 0.34) / 0.66)) },
  },
  // Stöt: kort indragning och ett rakt utfall.
  thrust: {
    trail: '#dfeaff',
    pose: (k) => k < 0.32
      ? { ang: mix(-0.55, -0.12, easeOut(k / 0.32)), reach: mix(20, 11, easeOut(k / 0.32)),
          twist: mix(0, 0.22, k / 0.32), lunge: -3 }
      : { ang: mix(-0.12, 0.02, (k - 0.32) / 0.68),
          reach: mix(11, 52, easeOut((k - 0.32) / 0.68)),
          twist: mix(0.22, -0.05, easeOut((k - 0.32) / 0.68)),
          lunge: Math.sin((k - 0.32) / 0.68 * Math.PI) * 9 },
  },
};

/** Vilopose: vapnet sänkt vid sidan. */
const REST = { ang: -0.55, reach: 20, twist: 0, lunge: 0 };

/**
 * Väljer hugg. Grundattacken växlar fram och tillbaka så att två slag i rad
 * aldrig är identiska, och var fjärde blir ett tyngre överhugg eller en stöt.
 * @param {any} p @param {string} kind
 */
export function pickAttack(p, kind) {
  if (kind === 'crush') return 'overhead';
  if (kind === 'shatter') return 'thrust';
  if (kind === 'rend') return 'backhand';
  if (kind === 'cleave') { p.attackFlip = !p.attackFlip; return p.attackFlip ? 'slash' : 'backhand'; }
  p.attackCount = (p.attackCount || 0) + 1;
  if (p.attackCount % 4 === 0) return rng.chance(0.5) ? 'overhead' : 'thrust';
  p.attackFlip = !p.attackFlip;
  return p.attackFlip ? 'slash' : 'backhand';
}

/* ------------------------------------------------------------------ */
/* Delar                                                               */
/* ------------------------------------------------------------------ */

/**
 * Figuren står alltid upprätt, som i Diablo 2 — kameravinkeln är låst och det
 * är *vilken bild* som ritas som ändras med riktningen, inte figurens rotation.
 * Lokalt rum: y = 0 vid fötterna, negativt uppåt.
 */
const H = {
  foot: 0, hem: -8, waist: -19, chest: -28, shoulder: -31, neck: -35, crown: -44,
};

/** Trasornas fästen längs mantelfållen. */
const TATTERS = [-9, -5.5, -2, 1.5, 5, 8.5];

/**
 * Manteln hänger från axlarna och vidgar sig nedåt, med trasig fåll.
 * Bakifrån täcker den hela kroppen; framifrån delar den sig och visar harnesket.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} fy Blickriktningens djupled: -1 bort från kameran, +1 mot
 * @param {number} sway @param {number} t @param {number} speed @param {boolean} flash
 */
function cloak(ctx, fy, sway, t, speed, flash) {
  const back = fy < 0;
  const wTop = 9.5, wBot = back ? 18 : 15.5;
  const hem = H.hem + Math.sin(t * 2.2) * 0.6;

  const shape = (/** @type {number} */ grow) => {
    ctx.beginPath();
    ctx.moveTo(-(wTop + grow), H.shoulder);
    ctx.quadraticCurveTo(-(wBot + grow) - sway * 0.5, H.waist, -(wBot + grow) - sway, hem);
    // trasig fåll: hörnen hoppar upp och ner i olika takt
    TATTERS.forEach((x, i) => {
      const dip = (i % 2 ? 5.5 : 1.5) + Math.sin(t * 3.2 + i * 1.3) * (0.8 + speed * 1.6);
      ctx.lineTo(x + sway * (0.4 + i * 0.05), hem + dip + grow);
    });
    ctx.lineTo(wBot + grow + sway * 0.6, hem + grow);
    ctx.quadraticCurveTo(wBot + grow, H.waist, wTop + grow, H.shoulder);
    ctx.quadraticCurveTo(0, H.shoulder - 3 - grow, -(wTop + grow), H.shoulder);
    ctx.closePath();
  };

  ctx.fillStyle = C.silhouette; shape(2); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : (back ? C.cloakMid : C.cloakDark);
  shape(0); ctx.fill();

  if (!flash) {
    ctx.save(); shape(0); ctx.clip();
    // veck: några lodräta skuggor som ger tyget tyngd
    ctx.strokeStyle = C.cloakDark; ctx.lineWidth = 2.4;
    for (const x of [-7, 0, 7]) {
      ctx.beginPath();
      ctx.moveTo(x * 0.7, H.shoulder + 2);
      ctx.quadraticCurveTo(x + sway * 0.4, H.waist, x * 1.25 + sway * 0.7, hem + 4);
      ctx.stroke();
    }
    ctx.strokeStyle = C.cloakLit; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-wTop + 1, H.shoulder + 1);
    ctx.quadraticCurveTo(-wBot - sway * 0.5, H.waist, -wBot - sway + 1, hem);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Vapnet, ritat längs +x från handen.
 * @param {CanvasRenderingContext2D} ctx @param {any} item @param {number} reach
 */
function weapon(ctx, item, reach) {
  const rarity = item?.rarity ?? 'normal';
  const blade = rarity === 'unique' ? '#d09a4a' : rarity === 'rare' ? '#e8d15a'
    : rarity === 'magic' ? '#9dc0f5' : '#c3cfdd';
  const icon = item?.base?.icon ?? '';
  const heavy = icon === '🔨', axe = icon === '🪓';
  const haft = reach * 0.7;
  const x = haft;

  ctx.fillStyle = C.haft;
  ctx.fillRect(-3, -1.8, haft + 3, 3.6);
  ctx.fillStyle = C.strap;
  ctx.fillRect(-3, -1.8, 5, 3.6);

  ctx.fillStyle = blade;
  ctx.beginPath();
  if (axe) {
    ctx.moveTo(x - 1, -2);
    ctx.quadraticCurveTo(x + reach * 0.15, -10, x + reach * 0.3, -3.5);
    ctx.quadraticCurveTo(x + reach * 0.22, 1.5, x - 1, 2.6);
  } else if (heavy) {
    ctx.moveTo(x, -6.5); ctx.lineTo(x + reach * 0.3, -5.5);
    ctx.lineTo(x + reach * 0.3, 5.5); ctx.lineTo(x, 6.5);
  } else {
    ctx.moveTo(x, -4.4); ctx.lineTo(x + reach * 0.46, -1.6);
    ctx.lineTo(x + reach * 0.46, 1.6); ctx.lineTo(x, 4.4);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, axe ? -3.5 : -3.2);
  ctx.lineTo(x + reach * (axe ? 0.18 : heavy ? 0.26 : 0.42), axe ? -8 : -1);
  ctx.stroke();
}

/**
 * Släpljuset efter eggen, ritat ur samma poskurva som vapnet. Både mörk kärna
 * och ljus framkant — ett rent vitt svep försvinner mot snön.
 * @param {CanvasRenderingContext2D} ctx @param {{pose:Pose, trail:string}} v
 * @param {number} k @param {number} mirror
 */
function trail(ctx, v, k, mirror) {
  const from = Math.max(0, k - 0.34);
  if (k - from < 0.03) return;
  const steps = 12;
  /** @type {{x:number,y:number}[]} */ const outer = [];
  /** @type {{x:number,y:number}[]} */ const inner = [];
  for (let i = 0; i <= steps; i++) {
    const q = v.pose(mix(from, k, i / steps));
    const ang = -q.ang * mirror;
    const len = 6 + q.reach;
    outer.push({ x: Math.cos(ang) * len * mirror, y: Math.sin(ang) * len });
    inner.push({ x: Math.cos(ang) * len * 0.42 * mirror, y: Math.sin(ang) * len * 0.42 });
  }
  const fade = 1 - Math.pow(k, 2.4);
  const ribbon = () => {
    ctx.beginPath();
    outer.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    for (let i = steps; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = 0.32 * fade;
  ctx.fillStyle = '#16222f';
  ribbon(); ctx.fill();
  const g = ctx.createLinearGradient(inner[0].x, inner[0].y, outer[steps].x, outer[steps].y);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, v.trail + '77');
  g.addColorStop(1, v.trail);
  ctx.globalAlpha = 0.72 * fade;
  ctx.fillStyle = g;
  ribbon(); ctx.fill();
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = v.trail; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath();
  const tail = Math.max(0, steps - 4);
  for (let i = tail; i <= steps; i++) i === tail ? ctx.moveTo(outer[i].x, outer[i].y) : ctx.lineTo(outer[i].x, outer[i].y);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Figuren                                                             */
/* ------------------------------------------------------------------ */

/** @param {CanvasRenderingContext2D} ctx @param {any} game */
export function drawHero(ctx, game) {
  const p = game.player;
  const t = performance.now() / 1000;
  const flash = p.hitFlash > 0;
  const gx = p.pos.x, gy = PY(p.pos.y);

  if (p.dead) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#241a20';
    ctx.beginPath(); ctx.ellipse(gx, gy, 20, 9, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  const rolling = !!p.roll;
  const rollK = rolling ? 1 - p.roll.t / p.roll.dur : 0;
  const speed = p.moving ? 1 : 0;

  // Riktningen: x avgör vilket håll gestalten vänder sig, y om vi ser fram- eller baksidan.
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  const mirror = fx < 0 ? -1 : 1;
  const back = fy < -0.25;

  // skugga på den hoptryckta marken
  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = '#16202e';
  const sSq = rolling ? 1.25 : 1;
  ctx.beginPath(); ctx.ellipse(gx, gy, 13 * sSq, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(gx, gy);

  if (rolling) {
    // Rullningen: gestalten kurar ihop sig till ett klot och rullar i färdriktningen.
    const tuck = 1 - Math.sin(rollK * Math.PI) * 0.22;
    ctx.translate(0, -13 * tuck);
    ctx.rotate(rollK * Math.PI * 2 * (Math.cos(p.roll.dir) < 0 ? -1 : 1));
    ctx.scale(tuck, tuck);
    ctx.fillStyle = C.silhouette;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : C.cloakMid;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.cloakDark;
    ctx.beginPath(); ctx.arc(4, -3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.hood;
    ctx.beginPath(); ctx.arc(-4, 4, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  ctx.scale(mirror, 1);

  const step = Math.sin(p.walkPhase * 8);
  const breath = Math.sin(t * 1.9) * 0.6;
  const bob = p.moving ? Math.abs(step) * 1.8 : breath;
  const sway = p.moving ? 4 + step * 2.5 : Math.sin(t * 1.4) * 1.2;

  const variant = p.swing?.variant ? ATTACKS[p.swing.variant] : null;
  const k = p.swing ? Math.min(1, p.swing.t / p.swing.dur) : 0;
  const pose = variant ? variant.pose(k) : REST;

  ctx.translate(pose.lunge * 0.5, -bob);
  ctx.rotate(pose.twist * 0.12);

  // --- ben ---------------------------------------------------------------
  ctx.strokeStyle = flash ? '#ffffff' : C.boot;
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  const stride = p.moving ? step * 5 : 0;
  ctx.beginPath(); ctx.moveTo(-2, H.waist + 4); ctx.lineTo(-2 + stride, H.foot - 1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, H.waist + 4); ctx.lineTo(3 - stride, H.foot - 1); ctx.stroke();

  // --- bakre mantelhalva när vi ser framsidan ----------------------------
  if (!back) cloak(ctx, fy, sway, t, speed, flash);

  // --- bål ----------------------------------------------------------------
  ctx.fillStyle = flash ? '#ffffff' : C.leather;
  ctx.beginPath();
  ctx.moveTo(-9, H.shoulder);
  ctx.quadraticCurveTo(-10, H.waist, -6.5, H.waist + 2);
  ctx.lineTo(6.5, H.waist + 2);
  ctx.quadraticCurveTo(10, H.waist, 9, H.shoulder);
  ctx.quadraticCurveTo(0, H.shoulder - 3, -9, H.shoulder);
  ctx.closePath(); ctx.fill();
  if (!flash) {
    ctx.strokeStyle = C.strap; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-7, H.chest + 6); ctx.lineTo(7, H.chest - 3); ctx.stroke();
    ctx.fillStyle = C.leatherLit;
    ctx.beginPath(); ctx.ellipse(3, H.chest, 4.5, 5, 0.1, 0, Math.PI * 2); ctx.fill();
  }

  // --- fri arm ------------------------------------------------------------
  ctx.strokeStyle = flash ? '#ffffff' : C.leather;
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(-7, H.shoulder + 2);
  ctx.quadraticCurveTo(-11, H.chest + 6, -9 + (p.moving ? step * 2.5 : 0), H.waist + 1);
  ctx.stroke();

  // --- vapenarm: svänger i skärmplanet, som ett D2-svep ------------------
  ctx.save();
  ctx.translate(7, H.shoulder + 2);
  if (variant) trail(ctx, variant, k, 1);
  ctx.rotate(-pose.ang);
  ctx.strokeStyle = flash ? '#ffffff' : C.leather;
  ctx.lineWidth = 4.8;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, 0); ctx.stroke();
  ctx.translate(7, 0);
  if (p.equipment.weapon) weapon(ctx, p.equipment.weapon, pose.reach);
  ctx.restore();

  // --- axelskydd: ett kvar, ett bortslaget för länge sedan ---------------
  ctx.fillStyle = flash ? '#ffffff' : C.pauldron;
  ctx.beginPath(); ctx.ellipse(8, H.shoulder + 1, 5.4, 4.2, -0.35, 0, Math.PI * 2); ctx.fill();
  if (!flash) {
    ctx.fillStyle = C.pauldronLit;
    ctx.beginPath(); ctx.ellipse(8.6, H.shoulder - 0.4, 3.4, 2.2, -0.35, 0, Math.PI * 2); ctx.fill();
  }

  // --- huvudet: hukat framåt, kåpan drar ner över pannan -----------------
  // Huvudet sitter något framför axellinjen — det är så framåtlutningen läser
  // i en upprätt gestalt. Huvan täcker pannan och lämnar bara en mörk springa.
  const hx = 2.2, hy = H.neck - 3.6;
  // kragen som huvan vilar i
  ctx.fillStyle = flash ? '#ffffff' : C.cloakDark;
  ctx.beginPath(); ctx.ellipse(0, H.shoulder + 1.5, 8, 3.6, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = C.silhouette;
  ctx.beginPath(); ctx.ellipse(hx, hy, 7.4, 7, -0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : C.hood;
  ctx.beginPath(); ctx.ellipse(hx, hy, 6.3, 6, -0.18, 0, Math.PI * 2); ctx.fill();
  if (!flash) {
    ctx.fillStyle = C.hoodLit;
    ctx.beginPath(); ctx.ellipse(hx - 0.8, hy - 2.4, 4.8, 3.1, -0.22, 0, Math.PI * 2); ctx.fill();
    if (!back) {
      ctx.fillStyle = C.hoodInner;
      ctx.beginPath(); ctx.ellipse(hx + 1.8, hy + 1.6, 3.7, 3.9, -0.12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.45 + fy * 0.3;
      ctx.fillStyle = C.face;
      ctx.beginPath(); ctx.ellipse(hx + 2.4, hy + 2.2, 2.2, 2.6, -0.12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // huvans spets faller bakåt över ryggen
    ctx.fillStyle = C.hood;
    ctx.beginPath();
    ctx.moveTo(hx - 4.6, hy - 2.6);
    ctx.quadraticCurveTo(hx - 11 - sway * 0.35, hy + 1, hx - 7.5, hy + 7.5);
    ctx.quadraticCurveTo(hx - 5, hy + 2.5, hx - 3, hy + 1.5);
    ctx.closePath(); ctx.fill();
  }

  // --- främre mantelhalva när vi ser ryggen ------------------------------
  if (back) cloak(ctx, fy, sway, t, speed, flash);

  ctx.restore();
}
