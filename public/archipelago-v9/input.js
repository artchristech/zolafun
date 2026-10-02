// Keyboard + mouse (pointer lock) and standard-mapping gamepads.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.device = 'kb';
    this.locked = false;
    this.move = { x: 0, z: 0 };
    this.look = { x: 0, y: 0 };
    this.interact = false;
    this.padPrev = [];
    this.padPressed = new Set();
    this.padHeld = new Set();
    this.padIndex = -1;
    this.anyPad = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Tab', 'Space'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.device = 'kb';
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.device = 'kb';
    });
    addEventListener('mousedown', () => { this.device = 'kb'; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { /* ignore */ }
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.padIndex >= 0 && pads[this.padIndex]) return pads[this.padIndex];
    for (const p of pads) if (p && p.connected) { this.padIndex = p.index; return p; }
    return null;
  }

  poll(dt) {
    let mx = 0, mz = 0, lx = 0, ly = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    lx = this.mdx * 0.0024; ly = this.mdy * 0.0024;
    this.mdx = this.mdy = 0;
    this.interact = this.pressed.has('KeyE');
    this.padPressed.clear();
    this.padHeld.clear();
    const p = this.pad();
    this.anyPad = !!p;
    if (p) {
      const dz = (x, y) => {
        const m = Math.hypot(x, y);
        if (m < 0.18) return [0, 0];
        const k = Math.min(1, (m - 0.18) / 0.82) / m;
        return [x * k, y * k];
      };
      const [ax, ay] = dz(p.axes[0] || 0, p.axes[1] || 0);
      const [rx, ry] = dz(p.axes[2] || 0, p.axes[3] || 0);
      if (ax || ay || rx || ry) this.device = 'pad';
      mx += ax; mz -= ay;
      lx += rx * 2.6 * dt; ly += ry * 2.0 * dt;
      p.buttons.forEach((b, i) => {
        const down = b.pressed || b.value > 0.5;
        if (down) { this.padHeld.add(i); this.device = 'pad'; }
        if (down && !this.padPrev[i]) this.padPressed.add(i);
        this.padPrev[i] = down;
      });
      if (this.padPressed.has(0)) this.interact = true;
    }
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    this.move.x = mx; this.move.z = mz;
    this.look.x = lx; this.look.y = ly;
  }

  endFrame() { this.pressed.clear(); }

  rumble(ms = 400, strong = 0.8, weak = 0.5) {
    const p = this.pad();
    if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
      p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    }
  }
}
