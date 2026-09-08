// @ts-check
import { KNOBS, T, DEFAULTS, setKnob, resetKnobs, isTuned, changedValues } from '../systems/tuning.js';
import { ZONE_DEFS } from '../systems/world.js';
import { escape } from './tooltip.js';

/**
 * The tuning panel, on `F3`.
 *
 * Feel cannot be argued about in words — it has to be dragged. This is the
 * shortest possible loop between "that felt wrong" and "that felt right": every
 * slider writes straight into the live value, so the change is on screen in the
 * same second, and **Copy values** puts the difference from the defaults on the
 * clipboard as one line to paste back.
 *
 * It is a development tool, not a menu. It is deliberately plain, it does not
 * follow the game's theme, and it should never ship in front of a player.
 */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

let built = false;

/** @param {any} game */
export function toggleTuner(game) {
  const el = $('tuner');
  if (!el.classList.contains('hidden')) { closeTuner(game); return; }
  if (!built) build(game);
  refresh();
  el.classList.remove('hidden');
  game.tunerOpen = true;
}

/** @param {any} game */
export function closeTuner(game) {
  $('tuner').classList.add('hidden');
  game.tunerOpen = false;
}

export function tunerOpen() { return !$('tuner').classList.contains('hidden'); }

/** @param {any} game */
function build(game) {
  const el = $('tuner');
  const groups = [...new Set(KNOBS.map(k => k.group))];

  el.innerHTML =
    '<div class="tn-head"><b>Tuning</b><span>F3 to close · dev only</span></div>' +
    '<div class="tn-jump"></div>' +
    groups.map(g =>
      `<div class="tn-grp">${escape(g)}</div>` +
      KNOBS.filter(k => k.group === g).map(k =>
        `<label class="tn-row" data-knob="${k.id}" title="${escape(k.note ?? '')}">` +
        `<span class="tn-lab">${escape(k.label)}</span>` +
        `<input type="range" min="${k.min}" max="${k.max}" step="${k.step}">` +
        `<span class="tn-val"></span></label>`).join('')
    ).join('') +
    '<div class="tn-actions">' +
    '<button data-act="copy">Copy values</button>' +
    '<button data-act="reset">Reset</button>' +
    '</div><div class="tn-out"></div>';

  // Jump straight to any map — the whole point of the test session is not
  // having to walk somewhere to look at something.
  const jump = /** @type {HTMLElement} */ (el.querySelector('.tn-jump'));
  jump.innerHTML = '<span class="tn-lab">Go to</span>';
  ZONE_DEFS.forEach((z, i) => {
    const b = document.createElement('button');
    b.textContent = z.name;
    b.onclick = () => { game.travel(i); closeTuner(game); };
    jump.appendChild(b);
  });

  for (const row of /** @type {HTMLElement[]} */ ([...el.querySelectorAll('.tn-row')])) {
    const id = row.dataset.knob ?? '';
    const input = /** @type {HTMLInputElement} */ (row.querySelector('input'));
    input.oninput = () => {
      setKnob(id, Number(input.value));
      paint(row, id);
      // The camera reads its width every resize, so nudge one to apply it live.
      if (id === 'viewWidth') dispatchEvent(new Event('resize'));
      if (id === 'moveSpeed') game.recalcPlayer?.();
    };
  }

  /** @type {HTMLElement} */ (el.querySelector('[data-act="copy"]')).onclick = () => copy(el);
  /** @type {HTMLElement} */ (el.querySelector('[data-act="reset"]')).onclick = () => {
    resetKnobs(); refresh(); dispatchEvent(new Event('resize')); game.recalcPlayer?.();
  };
  built = true;
}

/** @param {HTMLElement} row @param {string} id */
function paint(row, id) {
  const k = KNOBS.find(x => x.id === id);
  const v = T[id];
  /** @type {HTMLElement} */ (row.querySelector('.tn-val')).textContent =
    (k?.step ?? 1) < 1 ? v.toFixed(2) + (k?.unit ? ' ' + k.unit : '')
      : String(v) + (k?.unit ? ' ' + k.unit : '');
  row.classList.toggle('changed', v !== DEFAULTS[id]);
}

function refresh() {
  for (const row of /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.tn-row')])) {
    const id = row.dataset.knob ?? '';
    /** @type {HTMLInputElement} */ (row.querySelector('input')).value = String(T[id]);
    paint(row, id);
  }
}

/** @param {HTMLElement} el */
function copy(el) {
  const diff = changedValues();
  const out = /** @type {HTMLElement} */ (el.querySelector('.tn-out'));
  if (!isTuned()) { out.textContent = 'Nothing changed from the defaults.'; return; }
  const text = 'TUNING ' + Object.entries(diff).map(([k, v]) => `${k}=${v}`).join(' ');
  out.textContent = text;
  navigator.clipboard?.writeText(text).then(
    () => { out.textContent = text + '   ← copied'; },
    () => { out.textContent = text + '   ← select and copy'; });
}
