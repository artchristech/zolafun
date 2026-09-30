// Keyboard + mouse (pointer lock) + standard-mapping gamepad.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mdx = 0; this.mdy = 0;
    this.device = 'kbm';
    this.interactPressed = false;
    this.interactHeld = false;
    this.fpsToggle = false;
    this.anyPressed = false; // any start input this frame (title)
    this._padA = false; this._padBack = false; this._keyE = false; this._keyEEdge = false;
    this._clickEdge = false;
    this.pad = null;
    this.padMove = [0, 0]; this.padLook = [0, 0];
    this.gestureListeners = [];
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (e.code === 'KeyE') this._keyE = true; return; }
      this.device = 'kbm';
      this.keys.add(e.code);
      if (e.code === 'KeyE') { this._keyE = true; this._keyEEdge = true; }
      if (e.code === 'KeyF') this.fpsToggle = true;
      if (!['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'F5', 'F12', 'KeyF'].includes(e.code)) this.anyPressed = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this._gesture();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this._keyE = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this._keyE = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.mdx += e.movementX; this.mdy += e.movementY;
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.device = 'kbm';
      }
    });
    window.addEventListener('pointerdown', (e) => {
      this.device = 'kbm';
      this._clickEdge = true;
      this.anyPressed = true;
      this._gesture();
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas; });
  }

  onGesture(fn) { this.gestureListeners.push(fn); }
  _gesture() { for (const f of this.gestureListeners) f(); }

  requestLock() {
    if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
      try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }
  }

  poll() {
    this.interactPressed = false;
    this.fpsToggleOut = this.fpsToggle; this.fpsToggle = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = null;
    for (const p of pads) if (p && p.connected) { this.pad = p; break; }
    let padA = false;
    this.padMove[0] = this.padMove[1] = this.padLook[0] = this.padLook[1] = 0;
    if (this.pad) {
      const ax = this.pad.axes;
      const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
      this.padMove[0] = dz(ax[0] || 0); this.padMove[1] = dz(ax[1] || 0);
      this.padLook[0] = dz(ax[2] || 0); this.padLook[1] = dz(ax[3] || 0);
      padA = !!(this.pad.buttons[0] && this.pad.buttons[0].pressed);
      const back = !!(this.pad.buttons[8] && this.pad.buttons[8].pressed);
      if (back && !this._padBack) this.fpsToggleOut = true;
      this._padBack = back;
      let anyBtn = false;
      for (let i = 0; i < this.pad.buttons.length; i++) if (this.pad.buttons[i].pressed && i !== 8) anyBtn = true;
      if (anyBtn || Math.hypot(this.padMove[0], this.padMove[1]) > 0 || Math.hypot(this.padLook[0], this.padLook[1]) > 0) this.device = 'pad';
      if (padA && !this._padA) { this.interactPressed = true; this.startPad = true; this._gesture(); }
    }
    this._padA = padA;
    if (this._keyEEdge) { this.interactPressed = true; this._keyEEdge = false; }
    this.interactHeld = this._keyE || padA;
    this.clicked = this._clickEdge; this._clickEdge = false;
    this.started = this.anyPressed || (padA && this.startPad);
    this.anyPressed = false; this.startPad = false;
  }

  move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, y);
    if (l > 0) return [x / l, y / l];
    const pl = Math.hypot(this.padMove[0], this.padMove[1]);
    if (pl > 0) { const k = Math.min(1, pl) / pl; return [this.padMove[0] * k, this.padMove[1] * k]; }
    return [0, 0];
  }

  // returns [dyaw, dpitch] in radians for this frame
  look(dt) {
    const s = 0.0022;
    let yx = this.mdx * s, py = this.mdy * s;
    this.mdx = 0; this.mdy = 0;
    const lx = this.padLook[0], ly = this.padLook[1];
    yx += Math.sign(lx) * lx * lx * 2.8 * dt;
    py += Math.sign(ly) * ly * ly * 2.0 * dt;
    return [yx, py];
  }

  rumble(strength = 1, ms = 600) {
    const p = this.pad;
    if (!p) return;
    try {
      if (p.vibrationActuator && p.vibrationActuator.playEffect) {
        p.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: 0.6 * strength, strongMagnitude: strength });
      } else if (p.hapticActuators && p.hapticActuators[0]) {
        p.hapticActuators[0].pulse(strength, ms);
      }
    } catch (e) { /* ignore */ }
  }
}
