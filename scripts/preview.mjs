/**
 * The preview while the GM chooses where an encounter or a pin goes: the token pictures follow the pointer over the
 * map, a click places, a right click or Escape cancels. It is drawn as a layer over the map, like a ghost of the
 * group, so it works the same on Foundry 13 and 14. The keys "turn left" and "turn right" (Q and E unless rebound)
 * and Ctrl or Shift with the mouse wheel turn the group in quarter turns, like Foundry turns tokens with the wheel.
 */

import {MODULE_ID, esc, imageOr, isVideo, t} from "./config.mjs";
import {normalTurns} from "./encounter-data.mjs";

/** The preview that runs right now, if any. */
let running = null;

/** Milliseconds between two turns by the mouse wheel, so one flick of the wheel turns once. */
const WHEEL_PAUSE = 250;

/** The keybinding actions that turn the group. */
export const TURN_KEYS = {left: "turnLeft", right: "turnRight"};

/**
 * Turn the running preview by quarter turns. Only a preview of tokens turns, not the one of a pin.
 * @param {number} delta   1 turns clockwise (right), -1 counterclockwise (left)
 * @returns {boolean}      Was there a preview to turn? The keys hand the key to Foundry when not.
 */
export function turnPreview(delta) {
  return running?.turn(delta) ?? false;
}

/**
 * The first key bound to a keybinding action of the module, as Foundry's key settings show it, or null.
 * @param {string} action
 * @returns {string|null}
 */
function keyLabel(action) {
  try {
    const binding = game.keybindings.get(MODULE_ID, action)?.[0];
    if ( !binding?.key ) return null;
    const humanize = foundry.applications.sidebar?.apps?.ControlsConfig?.humanizeBinding;
    if ( typeof humanize === "function" ) return humanize(binding);
    return [...(binding.modifiers ?? []), binding.key.replace(/^(Key|Digit)/, "")].join(" + ");
  } catch {
    return null;
  }
}

/**
 * The line of the hint that tells how to turn the group, with the keys as bound right now.
 * @returns {string}
 */
export function turnHint() {
  const keys = [keyLabel(TURN_KEYS.left), keyLabel(TURN_KEYS.right)].filter(Boolean);
  return keys.length ? t("SSE.Turn.keys", {keys: keys.join(" / ")}) : t("SSE.Turn.wheel");
}

/**
 * How far a group is turned from its saved formation, in words, or "" when it is not.
 * @param {number} turns
 * @returns {string}
 */
export function facingLabel(turns) {
  const key = ["", "SSE.Turn.right", "SSE.Turn.half", "SSE.Turn.left"][normalTurns(turns)];
  return key ? t(key) : "";
}

/**
 * Is a preview running?
 * @returns {boolean}
 */
export function previewActive() {
  return !!running;
}

/**
 * Cancel the running preview.
 */
export function cancelPreview() {
  running?.finish(null);
}

export class PlacementPreview {
  /**
   * @param {object} options
   * @param {(center: {x: number, y: number}, snap: boolean, turns: number) => {x: number, y: number, width: number,
   *   height: number, src: string, scaleX?: number, scaleY?: number}[]} options.layout
   *   The tokens in pixels on the scene for a center point (top left corner, size in pixels), turned by quarter turns
   * @param {string} options.label       What a click does
   * @param {boolean} [options.pin=false]  Show a pin marker instead of tokens
   * @param {number} [options.turns=0]   Quarter turns clockwise to start with
   */
  constructor({layout, label, pin = false, turns = 0}) {
    this.layout = layout;
    this.label = label;
    this.pin = pin;
    this.turns = normalTurns(turns);
    this.point = null;
    this.frame = null;
    this.resolve = null;
    this.wheelAt = 0;
    this.handlers = {};
  }

  /**
   * Turn the group by quarter turns and draw it at once.
   * @param {number} delta   1 clockwise, -1 counterclockwise
   * @returns {boolean}      false for the preview of a pin
   */
  turn(delta) {
    if ( this.pin || !this.layer ) return false;
    this.turns = normalTurns(this.turns + Math.sign(Number(delta) || 0));
    this.#showFacing();
    this.#draw();
    return true;
  }

  /** Show in the hint how far the group is turned. */
  #showFacing() {
    const facing = this.hint?.querySelector(".sse-preview-facing");
    if ( !facing ) return;
    const text = facingLabel(this.turns);
    facing.textContent = text;
    facing.hidden = !text;
    this.hint.dataset.turns = String(this.turns);
  }

  /**
   * Show the preview and wait for the click.
   * @returns {Promise<{center: {x: number, y: number}, snap: boolean, turns: number}|null>}   null when cancelled
   */
  choose() {
    cancelPreview();
    running = this;
    return new Promise(resolve => {
      this.resolve = resolve;
      this.#build();
      this.#listen();
      const mouse = canvas.mousePosition;
      if ( mouse ) this.point = {x: mouse.x, y: mouse.y};
      this.#schedule();
    });
  }

  /** Create the layer and the hint. */
  #build() {
    this.layer = document.createElement("div");
    this.layer.className = "sse-preview-layer";
    this.hint = document.createElement("div");
    this.hint.className = "sse-preview-hint";
    const turning = this.pin ? "" : `<small class="sse-preview-turn">${esc(turnHint())}
      <b class="sse-preview-facing" hidden></b></small>`;
    this.hint.innerHTML = `<i class="fa-solid ${this.pin ? "fa-location-dot" : "fa-dragon"}" inert></i>
      <span><strong>${esc(this.label)}</strong>${turning}<small>${esc(t("SSE.Preview.keys"))}</small></span>`;
    document.body.append(this.layer, this.hint);
    this.#showFacing();
    // Foundry hands no keys to its keybindings while a text field has the focus, the search field for example
    if ( game.keyboard?.hasFocus ) document.activeElement?.blur?.();
  }

  /** Listen to the pointer, the keys and the camera. */
  #listen() {
    const board = canvas.app?.view;
    this.handlers.move = event => {
      this.shift = event.shiftKey;
      this.point = canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY});
      this.#schedule();
    };
    this.handlers.down = event => {
      // A right click cancels everywhere, also over a window; a left click only places on the map
      const cancel = event.button !== 0;
      if ( !cancel && (event.target !== board) ) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if ( cancel ) {
        // Swallow the context menu that follows the right click
        const swallow = e => {
          e.preventDefault();
          e.stopImmediatePropagation();
        };
        window.addEventListener("contextmenu", swallow, {capture: true, once: true});
        setTimeout(() => window.removeEventListener("contextmenu", swallow, {capture: true}), 1000);
        this.finish(null);
        return;
      }
      this.point = canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY});
      this.finish({center: {x: this.point.x, y: this.point.y}, snap: !event.shiftKey, turns: this.turns});
    };
    // Ctrl or Shift and the wheel over the map turn the group, the plain wheel still zooms. Foundry would turn the
    // selected tokens with these, so the wheel never reaches it while a group is placed.
    this.handlers.wheel = event => {
      if ( this.pin || (event.target !== board) ) return;
      const ctrl = game.keyboard?.isModifierActive?.("Control") ?? false;
      if ( !ctrl && !event.shiftKey ) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Shift and the wheel scroll sideways in some browsers
      const delta = event.deltaY || (event.shiftKey ? event.deltaX : 0);
      const now = Date.now();
      if ( !delta || (now - this.wheelAt < WHEEL_PAUSE) ) return;
      this.wheelAt = now;
      // Like Foundry's wheel rotation: down turns clockwise
      this.turn(Math.sign(delta));
    };
    this.handlers.block = event => {
      if ( event.target !== board ) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.handlers.key = event => {
      if ( event.key === "Escape" ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.finish(null);
      }
      else if ( event.key === "Shift" ) {
        this.shift = event.type === "keydown";
        this.#schedule();
      }
    };
    this.handlers.pan = () => this.#schedule();
    this.handlers.tearDown = () => this.finish(null);
    window.addEventListener("pointermove", this.handlers.move, true);
    window.addEventListener("pointerdown", this.handlers.down, true);
    for ( const type of ["pointerup", "click", "dblclick", "contextmenu"] ) {
      window.addEventListener(type, this.handlers.block, true);
    }
    window.addEventListener("keydown", this.handlers.key, true);
    window.addEventListener("keyup", this.handlers.key, true);
    window.addEventListener("wheel", this.handlers.wheel, {capture: true, passive: false});
    this.panHook = Hooks.on("canvasPan", this.handlers.pan);
    this.tearDownHook = Hooks.on("canvasTearDown", this.handlers.tearDown);
  }

  /** Draw on the next frame. */
  #schedule() {
    if ( this.frame ) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.#draw();
    });
  }

  /** Draw the ghost tokens or the pin where the pointer is. */
  #draw() {
    if ( !this.layer || !this.point || !canvas.ready ) return;
    const scale = canvas.stage.scale.x;
    if ( this.pin ) {
      const p = canvas.clientCoordinatesFromCanvas(this.point);
      this.layer.innerHTML = `<div class="sse-preview-pin" style="left:${p.x}px;top:${p.y}px">
        <i class="fa-solid fa-location-dot" inert></i></div>`;
      return;
    }
    const tokens = this.layout(this.point, !this.shift, this.turns);
    const parts = tokens.map(token => {
      const p = canvas.clientCoordinatesFromCanvas({x: token.x, y: token.y});
      const w = token.width * scale;
      const h = token.height * scale;
      const src = imageOr(token.src);
      const sx = Number(token.scaleX) || 1;
      const sy = Number(token.scaleY) || 1;
      const media = isVideo(src)
        ? `<video src="${esc(src)}" muted autoplay loop playsinline style="transform:scale(${sx},${sy})"></video>`
        : `<img src="${esc(src)}" alt="" draggable="false" style="transform:scale(${sx},${sy})">`;
      return `<div class="sse-preview-token" style="left:${p.x}px;top:${p.y}px;width:${w}px;height:${h}px">${media}</div>`;
    });
    this.layer.innerHTML = parts.join("");
  }

  /**
   * End the preview.
   * @param {{center: {x: number, y: number}, snap: boolean, turns: number}|null} result
   */
  finish(result) {
    if ( running === this ) running = null;
    if ( this.frame ) cancelAnimationFrame(this.frame);
    window.removeEventListener("pointermove", this.handlers.move, true);
    window.removeEventListener("pointerdown", this.handlers.down, true);
    for ( const type of ["pointerup", "click", "dblclick", "contextmenu"] ) {
      window.removeEventListener(type, this.handlers.block, true);
    }
    window.removeEventListener("keydown", this.handlers.key, true);
    window.removeEventListener("keyup", this.handlers.key, true);
    window.removeEventListener("wheel", this.handlers.wheel, {capture: true});
    if ( this.panHook !== undefined ) Hooks.off("canvasPan", this.panHook);
    if ( this.tearDownHook !== undefined ) Hooks.off("canvasTearDown", this.tearDownHook);
    this.panHook = this.tearDownHook = undefined;
    this.layer?.remove();
    this.hint?.remove();
    this.layer = this.hint = null;
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(result);
  }
}
