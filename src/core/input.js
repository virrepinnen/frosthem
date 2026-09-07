// @ts-check
/**
 * Tangentbord + mus. Vi skiljer på "nere" (kontinuerligt) och "tryckt"
 * (kant, konsumeras en gång per bildruta) så att UI-toggles inte studsar.
 */
export const input = {
  /** @type {Set<string>} */ down: new Set(),
  /** @type {Set<string>} */ pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, rdown: false, clicked: false, rclicked: false },
  /**
   * Spelet äger tangentbordet först när en karaktär är igång. Utan den här
   * spärren hamnade varje bokstav man skrev i namnrutan i tangentkön, och
   * första bildrutan konsumerade dem: "Sigrid" öppnade väskan (i), "Erik"
   * öppnade väska och skills (i, k). Det var därför fönster kunde stå öppna
   * direkt när man kom in i spelet.
   */
  enabled: false,
};

/**
 * Ett *synligt* textfält äger tangentbordet så länge det har fokus. Kravet på
 * synlighet är viktigt: fokus kan ligga kvar på namnrutan efter att menyn
 * gömts, och då hade spelet svalt alla tangenter i tysthet.
 */
function typingInField() {
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (!el) return false;
  const tag = el.tagName;
  const isField = tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  if (!isField) return false;
  return el.offsetParent !== null; // dolt fält räknas inte
}

/** Nollställer allt — anropas när ett spel startar. */
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
  // Släpp alltid, även om spärren slog till på vägen ner — annars kan en
  // tangent fastna i "nedtryckt".
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
