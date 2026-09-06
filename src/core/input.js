// @ts-check
/**
 * Tangentbord + mus. Vi skiljer på "nere" (kontinuerligt) och "tryckt"
 * (kant, konsumeras en gång per bildruta) så att UI-toggles inte studsar.
 */
export const input = {
  /** @type {Set<string>} */ down: new Set(),
  /** @type {Set<string>} */ pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, rdown: false, clicked: false, rclicked: false },
  /** True när fokus ligger i ett panel-UI och spelinput ska ignoreras. */
  overUI: false,
};

/** @param {HTMLCanvasElement} canvas */
export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['tab', ' ', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    if (!input.down.has(k)) input.pressed.add(k);
    input.down.add(k);
  });
  addEventListener('keyup', (e) => input.down.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { input.down.clear(); input.mouse.down = false; input.mouse.rdown = false; });

  canvas.addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; });
  addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.mouse.down = true; input.mouse.clicked = true; }
    if (e.button === 2) { input.mouse.rdown = true; input.mouse.rclicked = true; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.down = false;
    if (e.button === 2) input.mouse.rdown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Anropas i slutet av varje bildruta. */
export function endFrameInput() {
  input.pressed.clear();
  input.mouse.clicked = false;
  input.mouse.rclicked = false;
}

/** @param {string} k */
export const keyDown = (k) => input.down.has(k);
/** @param {string} k Konsumerar tryckningen. */
export function keyPressed(k) {
  if (input.pressed.has(k)) { input.pressed.delete(k); return true; }
  return false;
}
