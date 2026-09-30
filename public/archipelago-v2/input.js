// Keyboard + mouse (pointer lock) + standard-mapping gamepad.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.device = 'kb'; // 'kb' or 'pad'
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.interact = false;
    this.interactPressed = false;
    this.fpsPressed = false;
    this.run = false;
    this.anyPressed = false; // any button/key this frame (for starting)
    this.lastActivity = performance.now();
    this.locked = false;
    this._prevPad = [];
    this._kbInteract = false;
    this._kbInteractEdge = false;
    this._fpsEdge = false;
    this._anyEdge = false;
    this.padIndex = -1;
    this.onUserGesture = null;

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['KeyE', 'Space'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.device = 'kb';
      this.lastActivity = performance.now();
      this._anyEdge = true;
      if (e.code === 'KeyE' || e.code === 'Enter') { this._kbInteract = true; this._kbInteractEdge = true; }
      if (e.code === 'KeyF' || e.code === 'Backquote') this._fpsEdge = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.onUserGesture && this.onUserGesture('key');
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this._kbInteract = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this._kbInteract = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) {
        this.device = 'kb';
        this.lastActivity = performance.now();
      }
    });
    addEventListener('mousedown', (e) => {
      this.device = 'kb';
      this.lastActivity = performance.now();
      this._anyEdge = true;
      this.onUserGesture && this.onUserGesture('mouse');
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }
  requestLock() {
    if (document.pointerLockElement === this.canvas) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }
  getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let best = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (!best || p.mapping === 'standard') best = p;
    }
    return best;
  }
  rumble(strong = 0.8, weak = 0.5, ms = 500) {
    const p = this.getPad();
    if (!p) return;
    try {
      if (p.vibrationActuator && p.vibrationActuator.playEffect) {
        p.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
      } else if (p.hapticActuators && p.hapticActuators[0]) {
        p.hapticActuators[0].pulse(strong, ms);
      }
    } catch (e) { /* ignore */ }
  }
  update(dt) {
    // keyboard
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    let lx = this.mdx * 0.0022, ly = this.mdy * 0.0022;
    this.mdx = 0; this.mdy = 0;
    let interact = this._kbInteract;
    let interactEdge = this._kbInteractEdge;
    let fpsEdge = this._fpsEdge;
    let anyEdge = this._anyEdge;
    this._kbInteractEdge = false; this._fpsEdge = false; this._anyEdge = false;
    this.run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.padActiveEdge = false;

    const pad = this.getPad();
    if (pad) {
      const dz = (x, y, d) => {
        const m = Math.hypot(x, y);
        if (m < d) return [0, 0];
        const s = Math.min(1, (m - d) / (1 - d)) / m;
        return [x * s, y * s];
      };
      const ax = pad.axes;
      const [px, py] = dz(ax[0] || 0, ax[1] || 0, 0.18);
      const [rx, ry] = dz(ax[2] || 0, ax[3] || 0, 0.15);
      const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const prev = this._prevPad;
      const edge = (i) => btn(i) && !prev[i];
      let active = Math.hypot(px, py) > 0 || Math.hypot(rx, ry) > 0;
      for (let i = 0; i < pad.buttons.length; i++) if (btn(i)) active = true;
      if (active) { this.device = 'pad'; this.lastActivity = performance.now(); }
      for (let i = 0; i < pad.buttons.length; i++) if (edge(i)) { anyEdge = true; this.padActiveEdge = true; }
      if (Math.hypot(px, py) > 0) { mx = px; my = -py; }
      if (Math.hypot(rx, ry) > 0) {
        const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
        lx += curve(rx) * 2.8 * dt;
        ly += curve(ry) * 2.0 * dt;
      }
      if (btn(0)) interact = true;
      if (edge(0)) interactEdge = true;
      if (edge(8)) fpsEdge = true;
      if (btn(10) || btn(7) || Math.hypot(px, py) > 0.95) this.run = this.run || btn(10) || btn(7);
      this._prevPad = pad.buttons.map((b) => b.pressed);
    }
    if (Math.abs(mx) + Math.abs(my) > 0) this.lastMove = performance.now();
    this.move.x = mx; this.move.y = my;
    this.look.x = lx; this.look.y = ly;
    this.interact = interact;
    this.interactPressed = interactEdge;
    this.fpsPressed = fpsEdge;
    this.anyPressed = anyEdge;
  }
}
