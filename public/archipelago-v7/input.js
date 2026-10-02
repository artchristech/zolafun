// Keyboard + mouse (pointer lock) and standard-mapping gamepad input. Tracks the last device used.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.device = 'kbm';
    this.interactQueued = false;
    this.anyPress = false;
    this.pad = null;
    this.padA = false;
    this.padAEdge = false;
    this.padHold = false; // Y held (title restart)
    this.lx = 0; this.ly = 0; this.rx = 0; this.ry = 0;
    this.onGesture = null;
    this.toggleStats = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3' || e.code === 'Backquote') {
        e.preventDefault();
        if (!e.repeat) this.toggleStats = true;
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.device = 'kbm';
      if (!e.repeat) {
        this.anyPress = true;
        if (e.code === 'KeyE' || e.code === 'Enter') this.interactQueued = true;
      }
      this.keys.add(e.code);
      if (this.onGesture) this.onGesture('key', e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.device = 'kbm';
      }
    });
    window.addEventListener('pointerdown', (e) => {
      this.device = 'kbm';
      if (this.onGesture) this.onGesture('click', e);
    });
    window.addEventListener('gamepadconnected', () => {});
  }

  lockPointer() {
    if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (err) { /* pointer lock unavailable */ }
    }
  }

  poll() {
    this.padAEdge = false;
    let pad = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected && (p.mapping === 'standard' || !pad)) { pad = p; if (p.mapping === 'standard') break; }
    this.pad = pad;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
      this.lx = dz(pad.axes[0] || 0);
      this.ly = dz(pad.axes[1] || 0);
      this.rx = dz(pad.axes[2] || 0);
      this.ry = dz(pad.axes[3] || 0);
      const a = !!(pad.buttons[0] && pad.buttons[0].pressed);
      if (a && !this.padA) {
        this.padAEdge = true;
        this.interactQueued = true;
        this.anyPress = true;
        if (this.onGesture) this.onGesture('pad');
      }
      this.padA = a;
      this.padHold = !!(pad.buttons[3] && pad.buttons[3].pressed);
      let active = a || Math.abs(this.lx) + Math.abs(this.ly) + Math.abs(this.rx) + Math.abs(this.ry) > 0.2;
      for (let i = 1; i < pad.buttons.length && !active; i++) if (pad.buttons[i] && pad.buttons[i].pressed) active = true;
      if (active) this.device = 'pad';
    } else {
      this.lx = this.ly = this.rx = this.ry = 0;
      this.padA = false;
      this.padHold = false;
    }
  }

  move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const kl = Math.hypot(x, y);
    if (kl > 0) { x /= kl; y /= kl; }
    x += this.lx;
    y -= this.ly;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // Returns yaw/pitch deltas in radians.
  look(dt) {
    const sens = 0.0024;
    let dx = this.mdx * sens, dy = this.mdy * sens;
    this.mdx = this.mdy = 0;
    const curve = (v) => Math.sign(v) * v * v;
    dx += curve(this.rx) * 2.8 * dt;
    dy += curve(this.ry) * 2.0 * dt;
    return { dx, dy };
  }

  consumeInteract() {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  consumeAnyPress() {
    const v = this.anyPress;
    this.anyPress = false;
    return v;
  }

  rumble(strong = 0.8, weak = 0.6, ms = 600) {
    const p = this.pad;
    if (!p) return;
    try {
      if (p.vibrationActuator && p.vibrationActuator.playEffect) {
        p.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
      } else if (p.hapticActuators && p.hapticActuators[0]) {
        p.hapticActuators[0].pulse(strong, ms);
      }
    } catch (err) { /* no haptics */ }
  }
}
