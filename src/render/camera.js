// @ts-check
import { clamp } from '../core/math.js';

/**
 * `w`/`h` är synfältet i *världsenheter*. Zoomen sätts i renderarens
 * grundtransform, så all världslogik kan räkna i världskoordinater rakt av.
 */
/**
 * Låst kameravinkel, som i Diablo 2: ortografisk projektion utan
 * avståndsförminskning, men markplanet är hoptryckt i höjdled så att det lutar
 * bort från betraktaren. Allt som har höjd reser sig ur den hoptryckta marken i
 * *oförminskade* pixlar — det är den skillnaden som gör att en figur ser ut att
 * stå upp i stället för att ligga platt.
 *
 * 0,5 är D2:s rutnätsförhållande. Vi kör något mindre hoptryckt eftersom vår
 * värld inte är vriden 45° och därför tål mindre.
 */
export const PROJ = 0.58;

/** `w`/`h` är synfältet i världsenheter; `h` räknar in hoptryckningen. */
export const camera = { x: 0, y: 0, w: 0, h: 0, zoom: 1.7 };

/** Världspunkt → skärmpunkt inom kamerans transform. @param {number} y */
export const projY = (y) => y * PROJ;

/**
 * Kameran följer spelaren men lutar en bit mot muspekaren, så att man ser
 * lite mer åt det håll man siktar.
 * @param {any} game @param {number} dt
 */
export function updateCamera(game, dt) {
  const p = game.player;
  const mx = game.aim.x, my = game.aim.y;
  // OBS: sikteslägets världsposition beror på kameran, så det här är en
  // återkopplad loop. Förstärkningen (<1) gör den stabil, men den slutliga
  // förskjutningen blir k/(1-k) gånger musens avstånd från mitten — därför
  // hålls både faktorn och taken låga.
  const leadX = clamp((mx - p.pos.x) * 0.15, -100, 100);
  const leadY = clamp((my - p.pos.y) * 0.15, -80 / PROJ, 80 / PROJ);

  const tx = p.pos.x + leadX - camera.w / 2;
  const ty = p.pos.y + leadY - camera.h / 2;
  const k = 1 - Math.pow(0.0009, dt);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;

  // håll kameran innanför zonen när zonen är större än skärmen
  camera.x = game.zone.w > camera.w ? clamp(camera.x, 0, game.zone.w - camera.w) : (game.zone.w - camera.w) / 2;
  camera.y = game.zone.h > camera.h ? clamp(camera.y, 0, game.zone.h - camera.h) : (game.zone.h - camera.h) / 2;
}

/** @param {number} x @param {number} y */
export const toScreen = (x, y) => ({ x: (x - camera.x) * camera.zoom, y: (y - camera.y) * PROJ * camera.zoom });
/** @param {number} x @param {number} y */
export const toWorld = (x, y) => ({ x: x / camera.zoom + camera.x, y: y / camera.zoom / PROJ + camera.y });
