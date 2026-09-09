// @ts-check
/**
 * Line glyphs.
 *
 * Every icon in the game is a stroked path in a 24×24 box — no fills, no emoji.
 * Emoji rendered differently on every system, carried their own colour, and
 * dragged the tone somewhere the rest of the art was not going.
 *
 * The same path data serves both worlds: {@link glyph} wraps it in an inline
 * SVG for the DOM, and {@link strokeGlyph} feeds it to a canvas `Path2D`. One
 * source, so a glyph can never look like two different things.
 */

/** @type {Record<string,string>} */
export const GLYPHS = {
  // ---- attributes (kept: the tooltips still explain what gear gives) --------
  str: 'M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9',
  dex: 'M6 5.5L12.5 12 6 18.5M13 5.5L19.5 12 13 18.5',
  vit: 'M12 19.5s-6.8-4.2-6.8-9A3.8 3.8 0 0 1 12 8.2a3.8 3.8 0 0 1 6.8 2.3c0 4.8-6.8 9-6.8 9z',
  will: 'M12 3.8l2.1 6.1 6.1 2.1-6.1 2.1L12 20.2l-2.1-6.1L3.8 12l6.1-2.1z',

  // ---- item kinds ----------------------------------------------------------
  axe: 'M6.5 20.5L16 6.5M12.5 4.5c4 .5 7 3.5 7.5 7.5-4 1.5-7.5.5-9.5-2.5z',
  hammer: 'M5 20.5L14 9M10.5 3.5l8.5 6-3.5 5-8.5-6z',
  sword: 'M12 3.5v12.5M8.5 16h7M12 16v4M10.5 20h3',
  dagger: 'M12 6v7.5M9.5 13.5h5M12 13.5v4M10.5 17.5h3',
  polearm: 'M8.5 21L14 6M11.5 3.5c3.5 1.5 5 4 5 6.5-2.5.2-4.5-.8-5.5-3',
  shield: 'M12 3.5l7 2.5v5.8c0 4.2-3 7-7 8.7-4-1.7-7-4.5-7-8.7V6z',
  helm: 'M5 12.5a7 7 0 0 1 14 0V19h-4v-3.5H9V19H5z',
  chest: 'M8 4l4 2 4-2 3 3-1.5 3.5V20H6.5V10.5L5 7z',
  gloves: 'M7.5 20.5v-8c0-1 .5-2 1.5-2.5V6a1.5 1.5 0 0 1 3 0v3.5h1.5a3 3 0 0 1 3 3v8z',
  boots: 'M9.5 3.5v10.5l7 4.5v2.5H6.5V3.5z',
  belt: 'M3.5 9.5h17v5h-17zM9.5 9.5v5M14.5 9.5v5',
  ring: 'M12 8.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM10 5.5h4l-2 3z',
  amulet: 'M6 4l6 7 6-7M12 11.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  gold: 'M12 5.5c3.9 0 7 1.1 7 2.5s-3.1 2.5-7 2.5S5 9.4 5 8s3.1-2.5 7-2.5zM5 8v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V8M5 12v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4',
  potion: 'M10 3.5h4M11 3.5v4.7l-3.9 7.8c-.8 1.7.4 3.5 2.2 3.5h5.4c1.8 0 3-1.8 2.2-3.5L13 8.2V3.5M7.8 14.5h8.4',

  // ---- skills --------------------------------------------------------------
  cleave: 'M4 8.5c5-4 11-4 16 0M6.5 13c4-2.6 7-2.6 11 0',
  rend: 'M6 4c2 4 3 9 2.5 15M11 3.5c2 4.5 3 10 2.5 16M16 5c1.8 4 2.6 8.5 2.2 13.5',
  crush: 'M12 3v8.5M8 8l4 4 4-4M4.5 17.5h15M6.5 20.5h11',
  bloodthirst: 'M12 3.5c4 5 6 8 6 10.5a6 6 0 0 1-12 0C6 11.5 8 8.5 12 3.5z',
  whirlwind: 'M12.5 12.5a3 3 0 1 1 2.5-3c0 3-3.5 5-6.5 4S4.5 8.5 6.5 6 13 2.5 16.5 5s4 8 2 12',
  lightning: 'M13.2 3.5L6.5 13.2h4.4L10.2 20.5 17.6 10.6h-4.6z',
  flame: 'M12 3.5c3.4 4.2 5.6 6.9 5.6 9.8a5.6 5.6 0 0 1-11.2 0c0-1.8.7-3.2 2-4.6.5 1.4 1.2 2.1 1.9 2.3 0-2.8.6-5.5 1.7-7.5z',
  stone: 'M5 13.5l3.5-6.2 6.6-1.6L19 11l-1.6 6.4-6.8 1.4z',
  raven: 'M3.5 13.2c3.4-.6 5.8-2.6 7.6-5.7 1.6 3.5 4.6 5.5 9 5.5-2.4 2.6-5.4 3.9-8.4 3.9-3.1 0-5.9-1.2-8.2-3.7z',
  icenova: 'M12 12V4M12 12l6.9 4M12 12l-6.9 4M12 12v8M12 12l6.9-4M12 12L5.1 8',
  frostbite: 'M7.5 4h9l-1.7 8.5c-.6 3-1.7 4-2.8 4s-2.2-1-2.8-4zM12 6.5v6M10 8.5l4 2',
  shatter: 'M12 3l5.5 5.5-3 3.5 3 3.5L12 21l-5.5-5.5 3-3.5-3-3.5z',
  rimeaura: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15',
  wintergrasp: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 7.5L9.5 5M12 7.5L14.5 5M12 16.5L9.5 19M12 16.5l2.5 2.5',
  toughskin: 'M4 8c2.5-2 5.5-2 8 0s5.5 2 8 0M4 13c2.5-2 5.5-2 8 0s5.5 2 8 0M4 18c2.5-2 5.5-2 8 0s5.5 2 8 0',
  secondwind: 'M12 4v9.5M12 13.5c0 3-2 5-4.5 5S3.5 16 3.5 12.5V9M12 13.5c0 3 2 5 4.5 5s4-2 4-5.5V9',
  warcry: 'M4.5 9.5h3.5l4-3.5v12l-4-3.5H4.5zM15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  iceblood: 'M12 20s-7-4.4-7-9.4A3.9 3.9 0 0 1 12 8.7a3.9 3.9 0 0 1 7 1.9c0 5-7 9.4-7 9.4zM12 11.5v5M9.8 13l4.4 2.5M14.2 13l-4.4 2.5',
  unbreakable: 'M12 3.5l7 2.5v5.8c0 4.2-3 7-7 8.7-4-1.7-7-4.5-7-8.7V6zM8.5 11.5h7',

  // ---- boons ---------------------------------------------------------------
  edge: 'M5 19L19 5M13.5 5H19v5.5',
  swift: 'M5 6l5 6-5 6M12 6l5 6-5 6',
  crit: 'M12 4v5M12 15v5M4 12h5M15 12h5M7.6 7.6l3 3M13.4 13.4l3 3M16.4 7.6l-3 3M10.6 13.4l-3 3',
  weight: 'M7.5 6.5h9l3 13.5h-15zM10 6.5V4.5h4v2',
  regen: 'M12 19.5s-6.8-4.2-6.8-9A3.8 3.8 0 0 1 12 8.2a3.8 3.8 0 0 1 6.8 2.3c0 4.8-6.8 9-6.8 9zM12 11v4.5M9.8 13.2h4.4',
  resist: 'M12 3.5l7 2.5v5.8c0 4.2-3 7-7 8.7-4-1.7-7-4.5-7-8.7V6zM12 8v7M9.2 9.8l5.6 3.4M14.8 9.8l-5.6 3.4',
  boot: 'M10 4.5v9l6 4v3.5H7.5V4.5zM3 8.5h3.5M3 13h2.5',
  leech: 'M12 3.5c4 5 6 8 6 10.5a6 6 0 0 1-12 0C6 11.5 8 8.5 12 3.5zM12 10v5M9.8 12.8L12 15l2.2-2.2',
  arc: 'M3.5 14.5c3-6.5 14-6.5 17 0M8.5 9.5L5.5 6.5M15.5 9.5l3-3',
  scroll: 'M12 3.5l2.6 5.7 6.2.8-4.5 4.3 1.1 6.2-5.4-3-5.4 3 1.1-6.2L3.2 10l6.2-.8z',
  coinstar: 'M10 8c3.3 0 6 1 6 2.2s-2.7 2.3-6 2.3-6-1-6-2.3S6.7 8 10 8zM4 10.2v4c0 1.2 2.7 2.3 6 2.3s6-1.1 6-2.3v-4M18.5 3.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z',
  twin: 'M3.5 18.5L13.5 5M8 20L18 6.5',

  // ---- interface -----------------------------------------------------------
  bag: 'M8 8.5V6.5a4 4 0 0 1 8 0v2M4.5 8.5h15L18.2 20.5H5.8z',
  character: 'M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2zM18 6h2v12.5a2 2 0 0 1-2 2M9 9h6M9 12.5h6M9 16h4',
  tree: 'M12 20.5V15M12 15l-5-3.5V9M12 15l5-3.5V9M7 4.5a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6M17 4.5a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6M12 8a2.3 2.3 0 1 0 0 4.6A2.3 2.3 0 0 0 12 8z',
  hearth: 'M12 3.5c3 4 5 6.2 5 9a5 5 0 0 1-10 0c0-1.6.6-2.8 1.7-4.1.4 1.2 1 1.8 1.6 2 0-2.4.6-5 1.7-6.9z',
  lock: 'M8 11V8a4 4 0 0 1 8 0v3M6 11h12v9.5H6z',
  compass: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M15.2 8.8l-2.1 4.3-4.3 2.1 2.1-4.3z',
  wind: 'M3.5 8.5h9a3 3 0 1 0-3-3M3.5 12.5h12a3 3 0 1 1-3 3M3.5 16.5h7',
  bow: 'M5.5 19L18.5 6M18.5 6h-4.5M18.5 6v4.5M7 7a12 12 0 0 1 10 10',
  spark: 'M12 3.5l2.2 6.3 6.3 2.2-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.2z',
};

/** Maps a base item's `kind` to the glyph that draws it. */
export const KIND_GLYPH = /** @type {Record<string,string>} */ ({
  axe: 'axe', hammer: 'hammer', sword: 'sword', dagger: 'dagger', polearm: 'polearm',
  shield: 'shield', helm: 'helm', chest: 'chest', gloves: 'gloves', boots: 'boots',
  belt: 'belt', ring: 'ring', amulet: 'amulet',
});

/**
 * Inline SVG for the DOM. Takes its colour from the surrounding text, so a
 * glyph never fights the palette it is placed in.
 * @param {string} name @param {number} [weight] Stroke width in the 24-box
 */
export function glyph(name, weight = 1.5) {
  const d = GLYPHS[name];
  if (!d) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${weight}"` +
    ` stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/** @type {Map<string, Path2D>} */
const pathCache = new Map();

/**
 * Draws a glyph into a canvas, centred on the current origin.
 * The `Path2D` is built once per glyph and reused — parsing path data on every
 * frame for every item on the ground would show up in the profile.
 * @param {CanvasRenderingContext2D} ctx @param {string} name
 * @param {number} size Height in pixels
 * @param {string} color @param {number} [weight] Stroke width in the 24-box
 */
export function strokeGlyph(ctx, name, size, color, weight = 1.8) {
  const d = GLYPHS[name];
  if (!d) return;
  let path = pathCache.get(name);
  if (!path) { path = new Path2D(d); pathCache.set(name, path); }
  const k = size / 24;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  // The width is given in the 24-box and scales with the glyph, exactly as in
  // SVG — but never thinner than a screen pixel, or small icons vanish.
  ctx.lineWidth = Math.max(weight, 1 / k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}
