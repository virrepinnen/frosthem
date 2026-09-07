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

/** Paletten följer förlagan: dämpad olivbrun rock, varmgrå päls, blekt hår. */
const C = {
  silhouette: 'rgba(9,12,16,0.95)',
  robeDark: '#33332b',
  robe: '#585640',
  robeLit: '#6e6b51',
  furDark: '#584833',
  fur: '#8d7a5e',
  furTip: '#ab9779',
  hair: '#cdc8b6',
  hairDark: '#9a9584',
  skin: '#c9a382',
  skinDark: '#a37f61',
  patch: '#191512',
  gold: '#c9a256',
  staff: '#6b5136',
  staffLit: '#85745a',
  raven: '#1b2028',
  ravenLit: '#36445a',
  boot: '#2b2318',
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
 * Figuren står alltid lodrätt, som ett D2-sprite — riktningen byter *bild*,
 * inte rotation. Lokalt rum: y = 0 vid fötterna, negativt uppåt.
 */
const H = {
  foot: 0, hem: -3, knee: -14, waist: -21, chest: -31,
  shoulder: -35, neck: -38, head: -43, crown: -50,
};

/** Fållens hörn — ojämna av ålder och slitage. */
const HEM = [-1, -0.62, -0.24, 0.16, 0.55, 0.9];

/**
 * Rocken. Faller till marken och vidgar sig nedåt; fållen dras åt sidan av
 * mantelfjädern så att tyget släpar efter kroppen och pendlar tillbaka i vila.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} sway Sidled i lokalt rum, positivt = åt figurens framsida
 * @param {number} lift Hur mycket fållen lyfter av farten, 0..1
 * @param {number} t @param {boolean} flash @param {boolean} back
 */
function robe(ctx, sway, lift, t, flash, back) {
  const wTop = 8, wBot = 12.5 + lift * 3.5;
  const hemY = H.hem - lift * 5;

  const shape = (/** @type {number} */ grow) => {
    const W = wBot + grow;
    ctx.beginPath();
    ctx.moveTo(-(wTop + grow), H.shoulder);
    // bakre fall: släpar mest, eftersom tyget hänger efter
    ctx.quadraticCurveTo(-(wTop + 4 + grow) + sway * 0.3, H.waist, -W + sway * 1.15, hemY + grow);
    HEM.forEach((u, i) => {
      const dip = (i % 2 ? 4.5 : 1.2) + Math.sin(t * 2.4 + i * 1.4) * (0.5 + lift * 1.4);
      ctx.lineTo(u * W + sway * (1.15 - (u + 1) * 0.5), hemY + dip + grow);
    });
    ctx.quadraticCurveTo(wTop + 4 + grow + sway * 0.55, H.waist, wTop + grow, H.shoulder);
    ctx.quadraticCurveTo(0, H.shoulder - 2.5 - grow, -(wTop + grow), H.shoulder);
    ctx.closePath();
  };

  ctx.fillStyle = C.silhouette; shape(2); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : (back ? C.robeDark : C.robe);
  shape(0); ctx.fill();

  if (!flash) {
    ctx.save(); shape(0); ctx.clip();
    // veck: lodräta skuggor som lutar med utslaget
    ctx.strokeStyle = C.robeDark; ctx.lineWidth = 2.6;
    for (const x of [-6, 1, 8]) {
      ctx.beginPath();
      ctx.moveTo(x * 0.6, H.shoulder + 2);
      ctx.quadraticCurveTo(x + sway * 0.4, H.waist, x * 1.5 + sway, hemY + 3);
      ctx.stroke();
    }
    ctx.strokeStyle = C.robeLit; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wTop - 1, H.shoulder + 1);
    ctx.quadraticCurveTo(wTop + 4 + sway * 0.5, H.waist, wBot - 2 + sway * 0.6, hemY + 1);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Pälskragen över axlarna. Yttersta kanten är taggig — det är den som gör att
 * den läser som päls och inte som en axelplatta.
 * @param {CanvasRenderingContext2D} ctx @param {number} t @param {boolean} flash
 */
function mantle(ctx, t, flash) {
  const y = H.shoulder;
  const tufts = 13, w = 11.5, h = 7.5;
  const path = (/** @type {number} */ grow) => {
    ctx.beginPath();
    ctx.moveTo(-(w + grow), y - 2);
    for (let i = 0; i <= tufts; i++) {
      const u = i / tufts;
      const a = Math.PI - u * Math.PI;
      const spike = (i % 2 ? 1.16 : 0.94) + Math.sin(t * 1.6 + i) * 0.04;
      ctx.lineTo(Math.cos(a) * (w + grow) * spike, y + 2 + Math.sin(a) * (h + grow) * spike);
    }
    ctx.quadraticCurveTo(0, y - 9 - grow, -(w + grow), y - 2);
    ctx.closePath();
  };
  ctx.fillStyle = C.silhouette; path(1.8); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : C.fur; path(0); ctx.fill();
  if (!flash) {
    ctx.save(); path(0); ctx.clip();
    ctx.fillStyle = C.furDark;
    ctx.beginPath(); ctx.ellipse(2, y + 4, w, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.furTip; ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const x = -9 + i * 3.6;
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 1.5, y + 2); ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Huvudet: långt blekt hår, flätat skägg och ögonlapp. Ansiktet visas bara när
 * gestalten är vänd mot betraktaren — bakifrån ser man håret och kragen.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} sway @param {number} t @param {boolean} flash @param {boolean} back @param {number} fy
 */
function head(ctx, sway, t, flash, back, fy) {
  const hx = 1.6, hy = H.head;
  const drift = sway * 0.35 + Math.sin(t * 1.3) * 0.5;

  // håret bakom: en tung massa som faller ner över kragen
  ctx.fillStyle = flash ? '#ffffff' : C.hairDark;
  ctx.beginPath();
  ctx.moveTo(hx - 6, hy - 4);
  ctx.quadraticCurveTo(hx - 11 - drift, hy + 3, hx - 8 - drift * 1.4, H.shoulder - 1);
  ctx.quadraticCurveTo(hx - 2, H.shoulder - 4, hx + 3, hy + 4);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = C.silhouette;
  ctx.beginPath(); ctx.ellipse(hx, hy, 6.4, 6.6, -0.1, 0, Math.PI * 2); ctx.fill();

  if (back) {
    // Bakifrån: hårmassan faller ner över kragen i stället för att sluta som en
    // boll. Tonen är dämpad — ett ljust klot i nacken drog blicken helt fel.
    ctx.fillStyle = flash ? '#ffffff' : C.hairDark;
    ctx.beginPath();
    ctx.moveTo(hx - 5.6, hy - 2);
    ctx.quadraticCurveTo(hx - 6.5 - drift, hy + 5, hx - 5 - drift, H.shoulder - 2);
    ctx.quadraticCurveTo(hx + 1, H.shoulder + 1, hx + 5.5 - drift * 0.4, H.shoulder - 3);
    ctx.quadraticCurveTo(hx + 6.4, hy + 3, hx + 5, hy - 2.5);
    ctx.quadraticCurveTo(hx, hy - 7.5, hx - 5.6, hy - 2);
    ctx.closePath(); ctx.fill();
    if (!flash) {
      ctx.strokeStyle = C.hair; ctx.lineWidth = 1.3;
      for (const dx of [-3.2, -0.6, 2.2, 4.2]) {
        ctx.beginPath();
        ctx.moveTo(hx + dx, hy - 4.5);
        ctx.quadraticCurveTo(hx + dx * 1.2 - drift * 0.5, hy + 2, hx + dx * 1.3 - drift, hy + 8);
        ctx.stroke();
      }
    }
    return;
  }

  // ansiktet
  ctx.fillStyle = flash ? '#ffffff' : C.skin;
  ctx.beginPath(); ctx.ellipse(hx + 1.4, hy + 0.4, 4.6, 5.2, -0.08, 0, Math.PI * 2); ctx.fill();

  // skägget: långt, avsmalnande, med en fläta som svajar
  ctx.fillStyle = flash ? '#ffffff' : C.hair;
  ctx.beginPath();
  ctx.moveTo(hx - 3.4, hy + 1.5);
  ctx.quadraticCurveTo(hx - 2 + drift * 0.5, H.chest + 2, hx + 2.5 + drift, H.chest);
  ctx.quadraticCurveTo(hx + 6.5, hy + 4, hx + 5.6, hy - 0.5);
  ctx.quadraticCurveTo(hx + 2, hy + 3, hx - 3.4, hy + 1.5);
  ctx.closePath(); ctx.fill();

  // hår som faller framför axeln
  ctx.fillStyle = flash ? '#ffffff' : C.hair;
  ctx.beginPath();
  ctx.moveTo(hx - 1, hy - 6);
  ctx.quadraticCurveTo(hx + 7.5, hy - 5, hx + 6.5, hy + 1.5);
  ctx.quadraticCurveTo(hx + 3, hy - 4, hx - 1, hy - 3);
  ctx.closePath(); ctx.fill();

  if (!flash) {
    // ögonlappen — figurens tydligaste kännetecken
    ctx.strokeStyle = C.patch; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(hx - 2.6, hy - 3.4); ctx.lineTo(hx + 5.4, hy - 1.2); ctx.stroke();
    ctx.fillStyle = C.patch;
    ctx.beginPath(); ctx.ellipse(hx + 3.9, hy - 0.8, 2.1, 1.9, -0.25, 0, Math.PI * 2); ctx.fill();
    // det seende ögat
    ctx.fillStyle = '#2c2620';
    ctx.beginPath(); ctx.ellipse(hx + 0.4, hy - 1.4, 0.9, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35 + fy * 0.3;
    ctx.fillStyle = C.skinDark;
    ctx.beginPath(); ctx.ellipse(hx + 2.4, hy + 3.2, 2.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Korpen på axeln. Den vaggar i sin egen takt och lyfter huvudet ibland — en
 * liten rörelse som gör gestalten levande även när spelaren står stilla.
 * @param {CanvasRenderingContext2D} ctx @param {number} t @param {boolean} flash
 */
function raven(ctx, t, flash) {
  const bob = Math.sin(t * 2.3) * 0.7;
  const peck = Math.sin(t * 0.7) > 0.93 ? 1 : 0;
  ctx.save();
  ctx.translate(-9, H.shoulder - 4.5 + bob);
  ctx.fillStyle = C.silhouette;
  ctx.beginPath(); ctx.ellipse(0, 0, 4.7, 4, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? '#ffffff' : C.raven;
  ctx.beginPath(); ctx.ellipse(0, 0, 4, 3.4, -0.25, 0, Math.PI * 2); ctx.fill();
  // stjärt
  ctx.beginPath();
  ctx.moveTo(3.6, 0.6); ctx.lineTo(8.4, 3.2); ctx.lineTo(3.4, 2.4);
  ctx.closePath(); ctx.fill();
  // huvud och näbb
  ctx.beginPath(); ctx.ellipse(-4, -3.4 - peck, 2.5, 2.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, -3.8 - peck); ctx.lineTo(-9.6, -3 - peck * 1.6); ctx.lineTo(-5.8, -2.4 - peck);
  ctx.closePath(); ctx.fill();
  if (!flash) {
    ctx.fillStyle = C.ravenLit;
    ctx.beginPath(); ctx.ellipse(-0.6, -1.4, 3, 1.6, -0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
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
  const haft = reach * 0.7, x = haft;

  ctx.fillStyle = C.haft;
  ctx.fillRect(-3, -1.8, haft + 3, 3.6);
  ctx.fillStyle = C.gold;
  ctx.fillRect(-3, -1.8, 5, 3.6);
  ctx.fillRect(x - 2, -3.2, 2.6, 6.4);

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
 * Släpljuset efter eggen, ritat ur samma poskurva som vapnet.
 * @param {CanvasRenderingContext2D} ctx @param {{pose:Pose, trail:string}} v @param {number} k
 */
function trail(ctx, v, k) {
  const from = Math.max(0, k - 0.34);
  if (k - from < 0.03) return;
  const steps = 12;
  /** @type {{x:number,y:number}[]} */ const outer = [];
  /** @type {{x:number,y:number}[]} */ const inner = [];
  for (let i = 0; i <= steps; i++) {
    const q = v.pose(mix(from, k, i / steps));
    const ang = -q.ang, len = 6 + q.reach;
    outer.push({ x: Math.cos(ang) * len, y: Math.sin(ang) * len });
    inner.push({ x: Math.cos(ang) * len * 0.42, y: Math.sin(ang) * len * 0.42 });
  }
  const fade = 1 - Math.pow(k, 2.4);
  const ribbon = () => {
    ctx.beginPath();
    outer.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    for (let i = steps; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = 0.32 * fade; ctx.fillStyle = '#16222f';
  ribbon(); ctx.fill();
  const g = ctx.createLinearGradient(inner[0].x, inner[0].y, outer[steps].x, outer[steps].y);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, v.trail + '77');
  g.addColorStop(1, v.trail);
  ctx.globalAlpha = 0.72 * fade; ctx.fillStyle = g;
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
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  const mirror = fx < 0 ? -1 : 1;
  const back = fy < -0.3;

  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = '#16202e';
  ctx.beginPath(); ctx.ellipse(gx, gy, rolling ? 15 : 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(gx, gy);

  if (rolling) {
    const tuck = 1 - Math.sin(rollK * Math.PI) * 0.22;
    ctx.translate(0, -13 * tuck);
    ctx.rotate(rollK * Math.PI * 2 * (fx < 0 ? -1 : 1));
    ctx.scale(tuck, tuck);
    ctx.fillStyle = C.silhouette;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : C.robe;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.fur;
    ctx.beginPath(); ctx.arc(4, -3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.hair;
    ctx.beginPath(); ctx.arc(-4, 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  ctx.scale(mirror, 1);

  // Mantelutslaget till lokalt rum: x speglas med figuren, y är hoptryckt av
  // projektionen. Utslaget i djupled läser som en liten extra lyftning.
  const c = p.cloak;
  const sway = c.x * mirror * 0.5;
  const lift = Math.min(1, Math.hypot(c.x, c.y) / 26);

  const step = Math.sin(p.walkPhase * 8);
  const breath = Math.sin(t * 1.9) * 0.5;
  const speed = Math.hypot(p.velX, p.velY);
  const bob = speed > 5 ? Math.abs(step) * 1.6 : breath;

  const variant = p.swing?.variant ? ATTACKS[p.swing.variant] : null;
  const k = p.swing ? Math.min(1, p.swing.t / p.swing.dur) : 0;
  const pose = variant ? variant.pose(k) : REST;

  ctx.translate(pose.lunge * 0.5, -bob);
  ctx.rotate(pose.twist * 0.1 + sway * -0.004);

  // --- stövlar, knappt synliga under fållen ------------------------------
  ctx.fillStyle = flash ? '#ffffff' : C.boot;
  const stride = speed > 5 ? step * 3.5 : 0;
  ctx.beginPath(); ctx.ellipse(-2 + stride, H.foot - 1.5, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3 - stride, H.foot - 1.5, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();

  // --- staven i den fria handen: figurens lodräta linje ------------------
  const staffLean = -0.09 + sway * 0.004;
  ctx.save();
  ctx.translate(-6, H.chest);
  ctx.rotate(staffLean);
  ctx.strokeStyle = flash ? '#ffffff' : C.staff;
  ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, H.foot - H.chest); ctx.lineTo(0, -20); ctx.stroke();
  if (!flash) {
    ctx.strokeStyle = C.staffLit; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-0.7, H.foot - H.chest - 2); ctx.lineTo(-0.7, -18); ctx.stroke();
    // knölen upptill
    ctx.fillStyle = C.staff;
    ctx.beginPath(); ctx.ellipse(1, -20, 2.6, 3.4, 0.35, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // --- rocken -------------------------------------------------------------
  robe(ctx, sway, lift, t, flash, back);

  // --- fri arm som håller staven ------------------------------------------
  ctx.strokeStyle = flash ? '#ffffff' : C.robeLit;
  ctx.lineWidth = 4.4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, H.shoulder + 2);
  ctx.quadraticCurveTo(-9, H.chest + 3, -6.5, H.chest);
  ctx.stroke();
  if (!flash) {
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.ellipse(-6.4, H.chest, 2.1, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // --- vapenarm: svänger i skärmplanet ------------------------------------
  ctx.save();
  ctx.translate(7, H.chest + 1);
  if (variant) trail(ctx, variant, k);
  ctx.rotate(-pose.ang);
  ctx.strokeStyle = flash ? '#ffffff' : C.robeLit;
  ctx.lineWidth = 4.6;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, 0); ctx.stroke();
  ctx.translate(7, 0);
  if (!flash) {
    ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.ellipse(-2, 0, 1.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.ellipse(0.5, 0, 2.2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (p.equipment.weapon) weapon(ctx, p.equipment.weapon, pose.reach);
  ctx.restore();

  // --- pälskrage, huvud och korp ------------------------------------------
  mantle(ctx, t, flash);
  head(ctx, sway, t, flash, back, fy);
  raven(ctx, t, flash);

  ctx.restore();
}
