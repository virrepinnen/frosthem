// @ts-check
import { rng } from '../core/rng.js';

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

/** Trasornas fästen längs bakkanten — olika längd ger sliten, oregelbunden kant. */
const TATTERS = [
  { u: 0.18, len: 7.5, w: 3.2 }, { u: 0.38, len: 11.5, w: 2.6 },
  { u: 0.56, len: 6, w: 2.2 }, { u: 0.73, len: 12.5, w: 3 },
  { u: 0.90, len: 8, w: 2.4 },
];

/**
 * Manteln: en droppe som sveper bakåt, med lösa remsor längs bakkanten.
 * En sågtandad radie läser som spikboll — separata flikar läser som tyg.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} len @param {number} drift @param {number} t @param {number} speed @param {boolean} flash
 */
function cloak(ctx, len, drift, t, speed, flash) {
  const half = 13.5;
  ctx.save();
  ctx.rotate(drift * 0.5);

  /** @param {number} grow */
  const body = (grow) => {
    const L = len + grow, W = half + grow;
    ctx.beginPath();
    ctx.moveTo(5, W - 1.5);
    ctx.quadraticCurveTo(-L * 0.18, W + 2.5, -L * 0.55, W * 0.78);
    ctx.quadraticCurveTo(-L * 0.92, W * 0.42, -L, 0);
    ctx.quadraticCurveTo(-L * 0.92, -W * 0.42, -L * 0.55, -W * 0.78);
    ctx.quadraticCurveTo(-L * 0.18, -(W + 2.5), 5, -(W - 1.5));
    ctx.quadraticCurveTo(10 + grow, 0, 5, W - 1.5);
    ctx.closePath();
  };

  /** @param {number} grow */
  const flaps = (grow) => {
    TATTERS.forEach((f, i) => {
      const th = Math.PI * 0.42 + f.u * Math.PI * 1.16;
      const ax = Math.cos(th) * len * 0.86, ay = Math.sin(th) * half * 0.92;
      const wobble = Math.sin(t * (3.1 + i * 0.43) + i * 1.7) * (0.22 + speed * 0.5);
      const dir = Math.atan2(ay, ax) + wobble * 0.55;
      const L = f.len + grow + speed * 4;
      const w = f.w + grow;
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(dir + 1.57) * w, ay + Math.sin(dir + 1.57) * w);
      ctx.lineTo(ax + Math.cos(dir) * L, ay + Math.sin(dir) * L);
      ctx.lineTo(ax + Math.cos(dir - 1.57) * w, ay + Math.sin(dir - 1.57) * w);
      ctx.closePath();
      ctx.fill();
    });
  };

  ctx.fillStyle = C.silhouette;
  body(2.2); ctx.fill();
  flaps(1.3);

  ctx.fillStyle = flash ? '#ffffff' : C.cloakMid;
  body(0); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : C.cloakDark;
  flaps(0);

  if (!flash) {
    ctx.save();
    body(0); ctx.clip();
    ctx.fillStyle = C.cloakDark;
    ctx.beginPath();
    ctx.ellipse(-len * 0.42, 4.5, len * 0.62, half * 0.7, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.cloakLit;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(3, -10);
    ctx.quadraticCurveTo(-len * 0.4, -half - 1, -len * 0.88, -2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Vapnet, ritat längs +x från handen. Färgen följer sällsyntheten så att ett
 * fynd syns i handen och inte bara i väskan.
 * @param {CanvasRenderingContext2D} ctx @param {any} item @param {number} reach
 */
function weapon(ctx, item, reach) {
  const rarity = item?.rarity ?? 'normal';
  const blade = rarity === 'unique' ? '#d09a4a' : rarity === 'rare' ? '#e8d15a'
    : rarity === 'magic' ? '#9dc0f5' : '#c3cfdd';
  const heavy = (item?.base?.icon ?? '') === '🔨';
  const axe = (item?.base?.icon ?? '') === '🪓';
  const haftLen = reach * 0.6;
  const x = 4 + haftLen;

  ctx.fillStyle = C.haft;
  ctx.fillRect(4, -1.7, haftLen, 3.4);
  ctx.fillStyle = C.strap;
  ctx.fillRect(4, -1.7, 4.5, 3.4);

  ctx.fillStyle = blade;
  ctx.beginPath();
  if (axe) {
    // yxblad: brett och sitter på ena sidan av skaftet
    ctx.moveTo(x - 1, -1.8);
    ctx.quadraticCurveTo(x + reach * 0.16, -9.5, x + reach * 0.3, -3);
    ctx.quadraticCurveTo(x + reach * 0.22, 1, x - 1, 2.2);
  } else if (heavy) {
    ctx.moveTo(x, -6); ctx.lineTo(x + reach * 0.3, -5);
    ctx.lineTo(x + reach * 0.3, 5); ctx.lineTo(x, 6);
  } else {
    ctx.moveTo(x, -4.2); ctx.lineTo(x + reach * 0.44, -1.5);
    ctx.lineTo(x + reach * 0.44, 1.5); ctx.lineTo(x, 4.2);
  }
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, axe ? -3 : -3.2);
  ctx.lineTo(x + reach * (axe ? 0.2 : heavy ? 0.26 : 0.4), axe ? -7.5 : -1);
  ctx.stroke();
}

/**
 * Släpljuset efter eggen.
 *
 * Ritas analytiskt ur samma poskurva som vapnet, så bandet följer exakt den väg
 * klingan tog — inte en cirkelbåge som gissar. Bandet har både en mörk kärna och
 * en ljus framkant: ett rent vitt svep försvinner mot snön, som är nästan lika
 * ljus.
 *
 * @param {CanvasRenderingContext2D} ctx @param {{pose:Pose, trail:string}} variant @param {number} k
 */
function trail(ctx, variant, k) {
  const from = Math.max(0, k - 0.34);
  if (k - from < 0.03) return;
  const steps = 12;
  /** @type {{x:number,y:number}[]} */ const outer = [];
  /** @type {{x:number,y:number}[]} */ const inner = [];
  for (let i = 0; i <= steps; i++) {
    const q = variant.pose(mix(from, k, i / steps));
    const len = 4 + q.reach;
    outer.push({ x: Math.cos(q.ang) * len * 1.04, y: Math.sin(q.ang) * len * 1.04 });
    inner.push({ x: Math.cos(q.ang) * len * 0.44, y: Math.sin(q.ang) * len * 0.44 });
  }
  const fade = 1 - Math.pow(k, 2.4);
  ctx.save();

  const ribbon = () => {
    ctx.beginPath();
    outer.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    for (let i = steps; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
  };

  // mörk kärna först — det är den som gör att svepet syns mot snö
  ctx.globalAlpha = 0.30 * fade;
  ctx.fillStyle = '#16222f';
  ribbon(); ctx.fill();

  // ljust band som tonar bort mot början av svepet
  const g = ctx.createLinearGradient(inner[0].x, inner[0].y, outer[steps].x, outer[steps].y);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, variant.trail + '77');
  g.addColorStop(1, variant.trail);
  ctx.globalAlpha = 0.72 * fade;
  ctx.fillStyle = g;
  ribbon(); ctx.fill();

  // framkanten: den skarpa linje ögat läser som eggen
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = variant.trail;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const tail = Math.max(0, steps - 4);
  for (let i = tail; i <= steps; i++) {
    i === tail ? ctx.moveTo(outer[i].x, outer[i].y) : ctx.lineTo(outer[i].x, outer[i].y);
  }
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

  if (p.dead) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#241a20';
    ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y, 20, 11, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  const rolling = !!p.roll;
  const rollK = rolling ? 1 - p.roll.t / p.roll.dur : 0;
  const speed = p.moving ? 1 : 0;

  // skuggan krymper när figuren kurar ihop sig i rullningen
  const shrink = rolling ? 1 - Math.sin(rollK * Math.PI) * 0.3 : 1;
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#16202e';
  ctx.beginPath();
  ctx.ellipse(p.pos.x + 2, p.pos.y + 7, 15 * shrink, 6.5 * shrink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);

  if (rolling) {
    ctx.rotate(p.roll.dir + rollK * Math.PI * 2);
    const tuck = 1 - Math.sin(rollK * Math.PI) * 0.34;
    ctx.scale(tuck, tuck);
  } else {
    ctx.rotate(p.facing);
  }

  // Manteln drar åt det håll man kommer ifrån, inte rakt bakåt. Skillnaden
  // mellan gångriktning och blickriktning är det som får rörelsen att kännas.
  let drift = 0;
  if (p.moving && !rolling) {
    let d = (p.moveAngle ?? p.facing) - p.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    drift = d;
  }

  const step = Math.sin(p.walkPhase * 8);
  const breath = Math.sin(t * 1.9) * 0.5;
  const bob = p.moving ? step * 1.2 : breath;

  const variant = p.swing?.variant ? ATTACKS[p.swing.variant] : null;
  const k = p.swing ? Math.min(1, p.swing.t / p.swing.dur) : 0;
  const pose = variant ? variant.pose(k) : REST;

  if (variant) trail(ctx, variant, k);

  ctx.translate(pose.lunge * 0.4, 0);
  ctx.rotate(pose.twist * 0.35);

  const cloakLen = rolling ? 15 : 24 + speed * 10 + Math.abs(pose.lunge) * 0.5;
  cloak(ctx, cloakLen, drift, t, speed, flash);

  // --- ben ---------------------------------------------------------------
  ctx.fillStyle = flash ? '#ffffff' : C.boot;
  const gait = p.moving ? step * 4.5 : 0;
  ctx.beginPath(); ctx.ellipse(-1 + gait, 7, 4.2, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-1 - gait, -7, 4.2, 3, 0, 0, Math.PI * 2); ctx.fill();

  // --- bål: bara axelpartiet syns, resten ligger under manteln -----------
  ctx.fillStyle = flash ? '#ffffff' : C.leather;
  ctx.beginPath(); ctx.ellipse(-1, bob * 0.3, 8, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (!flash) {
    ctx.fillStyle = C.leatherLit;
    ctx.beginPath(); ctx.ellipse(0, bob * 0.3 - 1.5, 5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.strap; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-3, -6.5); ctx.lineTo(6, 4); ctx.stroke();
  }

  // --- ett axelskydd kvar, det andra bortslaget för länge sedan ----------
  ctx.fillStyle = flash ? '#ffffff' : C.pauldron;
  ctx.beginPath(); ctx.ellipse(1, -8.5, 5.6, 4.4, -0.32, 0, Math.PI * 2); ctx.fill();
  if (!flash) {
    ctx.fillStyle = C.pauldronLit;
    ctx.beginPath(); ctx.ellipse(1.8, -9.6, 3.6, 2.2, -0.32, 0, Math.PI * 2); ctx.fill();
  }

  // --- fri arm ------------------------------------------------------------
  ctx.strokeStyle = flash ? '#ffffff' : C.leather;
  ctx.lineWidth = 4.2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1, -7.5);
  ctx.quadraticCurveTo(6 - pose.twist * 4, -10.5, 9 + pose.lunge * 0.2, -6.5);
  ctx.stroke();

  // --- vapenarm och vapen -------------------------------------------------
  ctx.save();
  ctx.rotate(pose.ang);
  ctx.strokeStyle = flash ? '#ffffff' : C.leather;
  ctx.lineWidth = 4.6;
  ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(5, 0.5); ctx.stroke();
  if (p.equipment.weapon) weapon(ctx, p.equipment.weapon, pose.reach);
  ctx.restore();

  // --- kåpan: spetsig och skjuten framför axlarna ------------------------
  // Spetsen är figurens tydligaste riktningsmärke på håll, och att den sitter
  // framför kroppen är det som läser som hukad i en vy uppifrån.
  ctx.save();
  ctx.translate((p.moving ? step * 0.5 : breath * 0.4) + pose.lunge * 0.25, 0);
  /** @param {number} grow */
  const cowl = (grow) => {
    ctx.beginPath();
    ctx.moveTo(17 + grow, 0);
    ctx.quadraticCurveTo(12, 8.6 + grow, 2.5, 8 + grow);
    ctx.quadraticCurveTo(-4 - grow, 0, 2.5, -(8 + grow));
    ctx.quadraticCurveTo(12, -(8.6 + grow), 17 + grow, 0);
    ctx.closePath();
  };
  ctx.fillStyle = C.silhouette; cowl(1.8); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : C.hood; cowl(0); ctx.fill();
  if (!flash) {
    ctx.save(); cowl(0); ctx.clip();
    ctx.fillStyle = C.hoodLit;
    ctx.beginPath(); ctx.ellipse(6, -3.4, 9.5, 4.4, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = C.hoodInner;
    ctx.beginPath(); ctx.ellipse(11, 0.4, 3.8, 4.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = C.face;
    ctx.beginPath(); ctx.ellipse(12, 0.7, 2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.restore();
}
