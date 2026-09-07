// @ts-check
/**
 * Keyboard + mouse. We separate "down" (continuous) from "pressed" (edge,
 * consumed once per frame) so that UI toggles don't bounce.
 */
export const input = {
  /** @type {Set<string>} */ down: new Set(),
  /** @type {Set<string>} */ pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, rdown: false, clicked: false, rclicked: false },
  /**
   * The game owns the keyboard only once a character is running. Without this
   * gate every letter typed into the name field queued up as a keypress, and
   * the first frame consumed them all: "Sigrid" opened the bag (i), "Erik"
   * opened bag and skills (i, k). That is why panels could already be open the
   * moment you entered the game.
   */
  enabled: false,
};

/**
 * A *visible* text field owns the keyboard while it has focus. The visibility
 * requirement matters: focus can linger on the name field after the menu is
 * hidden, and then the game would swallow every key in silence.
 */
function typingInField() {
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (!el) return false;
  const tag = el.tagName;
  const isField = tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  if (!isField) return false;
  return el.offsetParent !== null; // a hidden field does not count
}

/** Clears everything — called when a game starts. */
export function resetInput() {
  input.down.clear();
  input.pressed.clear();
  input.mouse.down = false;
  input.mouse.rdown = false;
  input.mouse.clicked = false;
  input.mouse.rclicked = false;
}

/** @param {boolean} on */
export function setInputEnabled(on) {
  if (!on) resetInput();
  input.enabled = on;
}

/** @param {HTMLCanvasElement} canvas */
export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (!input.enabled || typingInField()) return;
    const k = e.key.toLowerCase();
    if (['tab', ' ', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    if (!input.down.has(k)) input.pressed.add(k);
    input.down.add(k);
  });
  // Always release, even if the gate stopped the keydown — otherwise a key
  // can get stuck "held down".
  addEventListener('keyup', (e) => input.down.delete(e.key.toLowerCase()));
  addEventListener('blur', () => resetInput());

  canvas.addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; });
  addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', (e) => {
    if (!input.enabled) return;
    if (e.button === 0) { input.mouse.down = true; input.mouse.clicked = true; }
    if (e.button === 2) { input.mouse.rdown = true; input.mouse.rclicked = true; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.down = false;
    if (e.button === 2) input.mouse.rdown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Called at the end of every frame. */
export function endFrameInput() {
  input.pressed.clear();
  input.mouse.clicked = false;
  input.mouse.rclicked = false;
}

/** @param {string} k */
export const keyDown = (k) => input.down.has(k);
/** @param {string} k Consumes the press. */
export function keyPressed(k) {
  if (input.pressed.has(k)) { input.pressed.delete(k); return true; }
  return false;
}
