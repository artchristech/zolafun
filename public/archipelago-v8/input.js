// Keyboard + mouse (pointer lock) and standard-mapping gamepads. Tracks which
// device was used last so prompts can show the matching glyph.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mdx = 0; this.mdy = 0;
    this.device = 'kbm';
    this.pressed = new Set();     // edge-triggered keys this frame
    this.padPrev = [];
    this.pad = null;
    this.padA = false; this.padAEdge = false; this.padY = false; this.padStart = false;
    this.locked = false;
    this.anyEdge = false;
    this.listeners = [];
    addEventListener('keydown', (e) => {
      if (['Tab', 'F3', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.pressed.add(e.code); this.anyEdge = true; }
      this.keys.add(e.code);
      this.device = 'kbm';
      this.emit('gesture', e);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      // pointer lock normally; dragging with a button held works as a fallback
      if (this.locked || (e.buttons & 1)) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; this.device = 'kbm'; }
    });
    addEventListener('mousedown', (e) => { this.device = 'kbm'; this.emit('gesture', e); this.emit('click', e); });
    addEventListener('mouseup', (e) => this.emit('mouseup', e));
    addEventListener('touchstart', (e) => this.emit('gesture', e), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.emit('lock', this.locked);
    });
  }
  on(name, fn) { this.listeners.push([name, fn]); }
  emit(name, arg) { for (const [n, f] of this.listeners) if (n === name) f(arg); }
  lock() {
    if (this.locked) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed right now */ }
  }
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.pad = pad;
    this.padAEdge = false; this.padYEdge = false;
    if (pad) {
      const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const a = btn(0), y = btn(3);
      this.padAEdge = a && !this.padA;
      this.padYEdge = y && !this.padY;
      this.padA = a; this.padY = y;
      let active = a || y;
      for (let i = 0; i < pad.buttons.length; i++) if (btn(i)) active = true;
      for (let i = 0; i < Math.min(4, pad.axes.length); i++) if (Math.abs(pad.axes[i]) > 0.35) active = true;
      if (active) this.device = 'pad';
    } else { this.padA = false; this.padY = false; }
  }
  axis(i) {
    if (!this.pad || this.pad.axes.length <= i) return 0;
    const v = this.pad.axes[i];
    const dz = 0.16;
    return Math.abs(v) < dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
  }
  move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    const px = this.axis(0), py = -this.axis(1);
    if (Math.abs(px) + Math.abs(py) > Math.abs(x) + Math.abs(y)) { x = px; y = py; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
  look(dt) {
    const s = 0.0024;
    let dx = this.mdx * s, dy = this.mdy * s;
    this.mdx = 0; this.mdy = 0;
    const rx = this.axis(2), ry = this.axis(3);
    dx += rx * Math.abs(rx) * 2.8 * dt;
    dy += ry * Math.abs(ry) * 1.9 * dt;
    return { dx, dy };
  }
  interact() { return this.pressed.has('KeyE') || this.padAEdge; }
  endFrame() { this.pressed.clear(); this.anyEdge = false; }
}
