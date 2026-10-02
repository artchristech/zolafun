// Five Lights — keyboard/mouse + standard-mapping gamepad, unified.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.device = 'kbm';
    this.lookDX = 0; this.lookDY = 0;
    this.mouseDown = false;
    this.edges = new Set(); // one-shot actions this frame: interact, stats, start
    this.locked = false;
    this.padIndex = -1;
    this.padPrev = [];
    this.padHeld = {};
    this.moveX = 0; this.moveY = 0;
    this.lookPadX = 0; this.lookPadY = 0;
    this.onGesture = null; // called on any click / key (audio unlock)
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Tab', 'Space'].includes(e.code)) e.preventDefault(); return; }
      this.device = 'kbm';
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') this.edges.add('interact');
      if (e.code === 'Backquote' || e.code === 'F2' || e.code === 'KeyP') this.edges.add('stats');
      this.edges.add('anykey');
      if (['Space', 'Tab', 'F2'].includes(e.code)) e.preventDefault();
      this.onGesture && this.onGesture('key', e);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX; this.lookDY += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.device = 'kbm';
    });
    addEventListener('mousedown', (e) => {
      this.device = 'kbm'; this.mouseDown = true;
      this.edges.add('click');
      this.onGesture && this.onGesture('click', e);
    });
    addEventListener('mouseup', () => { this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas; });
    addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; });
  }
  requestLock() {
    if (document.pointerLockElement === this.canvas) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.padIndex >= 0 && pads[this.padIndex]) return pads[this.padIndex];
    for (const p of pads) if (p && p.connected) { this.padIndex = p.index; return p; }
    return null;
  }
  poll() {
    const p = this.pad();
    this.moveX = 0; this.moveY = 0; this.lookPadX = 0; this.lookPadY = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) this.moveY += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) this.moveY -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) this.moveX += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) this.moveX -= 1;
    this.padHeld = {};
    if (p) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      const btn = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      let active = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.05;
      for (let i = 0; i < p.buttons.length; i++) {
        const b = btn(i);
        if (b) { active = true; this.padHeld[i] = true; }
        if (b && !this.padPrev[i]) {
          if (i === 0) { this.edges.add('interact'); this.edges.add('padA'); }
          if (i === 8) this.edges.add('stats');
          this.edges.add('anypad');
        }
        this.padPrev[i] = b;
      }
      if (active) this.device = 'pad';
      if (Math.abs(lx) + Math.abs(ly) > 0) { this.moveX = lx; this.moveY = -ly; }
      this.lookPadX = rx; this.lookPadY = ry;
    }
    const l = Math.hypot(this.moveX, this.moveY);
    if (l > 1) { this.moveX /= l; this.moveY /= l; }
  }
  take(name) { const h = this.edges.has(name); this.edges.delete(name); return h; }
  endFrame() { this.edges.clear(); this.lookDX = 0; this.lookDY = 0; }
  rumble(ms = 600, strong = 1, weak = 0.6) {
    const p = this.pad();
    try {
      if (p && p.vibrationActuator) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      else if (p && p.hapticActuators && p.hapticActuators[0]) p.hapticActuators[0].pulse(strong, ms);
    } catch (e) { /* ignore */ }
  }
}
