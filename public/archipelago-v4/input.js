// Keyboard + mouse (pointer lock) and standard-mapping gamepads.
// Tracks which device was used last so prompts can show the right glyph.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.mdx = 0; this.mdy = 0;
    this.device = 'kb';
    this.locked = false;
    this.padPrev = [];
    this.padEdges = new Set();
    this.padHeld = new Set();
    this.pad = null;
    this.moveX = 0; this.moveY = 0; this.lookX = 0; this.lookY = 0;
    this.activity = 0; // seconds since any input
    this.mouseDownAny = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.edges.add(e.code); this.device = 'kb'; this.activity = 0;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'Backquote'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) { this.device = 'kb'; this.activity = 0; }
    });
    addEventListener('mousedown', () => { this.device = 'kb'; this.activity = 0; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }
  requestLock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  pressed(code) { return this.edges.has(code); }
  padPressed(i) { return this.padEdges.has(i); }
  padDown(i) { return this.padHeld.has(i); }
  poll(dt) {
    this.activity += dt;
    this.padEdges.clear(); this.padHeld.clear();
    let pad = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.pad = pad;
    let px = 0, py = 0, lx = 0, ly = 0;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
      px = dz(pad.axes[0] || 0); py = dz(pad.axes[1] || 0);
      lx = dz(pad.axes[2] || 0); ly = dz(pad.axes[3] || 0);
      pad.buttons.forEach((b, i) => {
        const down = b.pressed || b.value > 0.5;
        if (down) this.padHeld.add(i);
        if (down && !this.padPrev[i]) this.padEdges.add(i);
        this.padPrev[i] = down;
      });
      if (Math.abs(px) + Math.abs(py) + Math.abs(lx) + Math.abs(ly) > 0.3 || this.padEdges.size) { this.device = 'pad'; this.activity = 0; }
    }
    // keyboard movement
    let kx = 0, ky = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (kx || ky) this.activity = 0;
    this.moveX = kx + px; this.moveY = ky - py;
    const sens = 0.0022;
    this.lookX = this.mdx * sens + lx * 2.6 * dt;
    this.lookY = this.mdy * sens + ly * 1.9 * dt;
    if (this.mdx || this.mdy) this.activity = 0;
    this.mdx = 0; this.mdy = 0;
  }
  interact() { return this.pressed('KeyE') || this.padPressed(0); }
  endFrame() { this.edges.clear(); }
  vibrate(strong = 1, ms = 600) {
    const p = this.pad;
    if (!p) return;
    try {
      if (p.vibrationActuator && p.vibrationActuator.playEffect) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 });
      else if (p.hapticActuators && p.hapticActuators[0]) p.hapticActuators[0].pulse(strong, ms);
    } catch (e) { /* ignore */ }
  }
}
