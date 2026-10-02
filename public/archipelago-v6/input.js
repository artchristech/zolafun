// Five Lights — keyboard/mouse with pointer lock, and standard-mapping gamepads.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mdx = 0; this.mdy = 0;
    this.device = 'kb';
    this.pressed = new Set();   // edge-triggered this frame
    this.padPrev = [];
    this.pad = null;
    this.locked = false;
    this.mouseDown = false;
    this.onGesture = null;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.device = 'kb';
      this.onGesture && this.onGesture('key');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; this.device = 'kb'; }
    });
    addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.device = 'kb';
      this.pressed.add('Mouse' + e.button);
      this.onGesture && this.onGesture('click');
    });
    addEventListener('mouseup', () => { this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }
  lock() {
    if (this.locked || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* not allowed yet; the next click will retry */ }
  }
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.pad = pad;
    this.padNow = [];
    if (pad) {
      for (let i = 0; i < pad.buttons.length; i++) {
        const v = pad.buttons[i].pressed;
        this.padNow[i] = v;
        if (v && !this.padPrev[i]) { this.pressed.add('Pad' + i); this.device = 'pad'; }
      }
      for (const a of pad.axes) if (Math.abs(a) > 0.35) { this.device = 'pad'; break; }
      this.padPrev = this.padNow.slice();
    }
  }
  axis(i) {
    if (!this.pad) return 0;
    const v = this.pad.axes[i] || 0;
    return Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
  }
  padHeld(i) { return !!(this.padNow && this.padNow[i]); }
  move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.axis(0); y -= this.axis(1);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  look(dt) {
    const k = 0.0022;
    let dx = this.mdx * k, dy = this.mdy * k;
    this.mdx = this.mdy = 0;
    dx += this.axis(2) * 2.6 * dt;
    dy += this.axis(3) * 1.9 * dt;
    return { dx, dy };
  }
  interact() { return this.pressed.has('KeyE') || this.pressed.has('Pad0'); }
  interactHeld() { return this.keys.has('KeyE') || this.padHeld(0); }
  endFrame() { this.pressed.clear(); }
  rumble(strong = 0.8, weak = 0.5, ms = 600) {
    const a = this.pad && this.pad.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}
