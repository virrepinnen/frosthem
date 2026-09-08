// @ts-check
import { clamp } from '../core/math.js';

/**
 * Locked camera angle, as in Diablo 2: orthographic projection with no
 * perspective foreshortening, but the ground plane is squashed vertically so it
 * tilts away from the viewer. Everything with height rises out of the squashed
 * ground in *unsquashed* pixels — that difference is what makes a figure look
 * like it is standing up rather than lying flat.
 *
 * 0.5 is D2's grid ratio. We use slightly less squash because our world is not
 * rotated 45° and therefore tolerates less.
 */
export const PROJ = 0.58;

/** `w`/`h` is the view in world units; `h` accounts for the squash. Zoom is set
 *  in the renderer's base transform, so all world logic works in world units. */
export const camera = { x: 0, y: 0, w: 0, h: 0, zoom: 1.7 };

/** World point → screen point inside the camera transform. @param {number} y */
export const projY = (y) => y * PROJ;

/**
 * The camera follows the player but leans a little towards the mouse, so you
 * see slightly more in the direction you are aiming.
 * @param {any} game @param {number} dt
 */
export function updateCamera(game, dt) {
  const p = game.player;
  const mx = game.aim.x, my = game.aim.y;
  // NOTE: the aim's world position depends on the camera, so this is a feedback
  // loop. The gain (<1) keeps it stable, but the final offset ends up k/(1-k)
  // times the mouse's distance from the centre — which is why both the factor
  // and the caps are kept low.
  const leadX = clamp((mx - p.pos.x) * 0.15, -100, 100);
  const leadY = clamp((my - p.pos.y) * 0.15, -80 / PROJ, 80 / PROJ);

  const tx = p.pos.x + leadX - camera.w / 2;
  const ty = p.pos.y + leadY - camera.h / 2;
  const k = 1 - Math.pow(0.0009, dt);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;

  // Kept inside the *world*, not inside one map: at a seam the camera has to be
  // allowed over the join, or it would stop dead halfway across a border.
  const b = game.world?.bounds ?? { x0: 0, y0: 0, x1: game.zone.w, y1: game.zone.h };
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  camera.x = bw > camera.w ? clamp(camera.x, b.x0, b.x1 - camera.w) : b.x0 + (bw - camera.w) / 2;
  camera.y = bh > camera.h ? clamp(camera.y, b.y0, b.y1 - camera.h) : b.y0 + (bh - camera.h) / 2;
}

/** @param {number} x @param {number} y */
export const toScreen = (x, y) => ({ x: (x - camera.x) * camera.zoom, y: (y - camera.y) * PROJ * camera.zoom });
/** @param {number} x @param {number} y */
export const toWorld = (x, y) => ({ x: x / camera.zoom + camera.x, y: y / camera.zoom / PROJ + camera.y });
