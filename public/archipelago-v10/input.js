// Keyboard + mouse (pointer lock) and standard-mapping gamepad input.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.device = 'kb';
    this.edges = new Set();
    this.padPrev = [];
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, a: false, y: false };
    this.onFirstGesture = null;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
      this.device = 'kb';
      if (this.onFirstGesture) this.onFirstGesture(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.device = 'kb';
      }
    });
    window.addEventListener('mousedown', (e) => {
      this.device = 'kb';
      this.edges.add('Mouse' + e.button);
      if (this.onFirstGesture) this.onFirstGesture(e);
    });
  }
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gamepad = gp;
    const P = this.pad;
    if (!gp) {
      P.lx = P.ly = P.rx = P.ry = 0;
      P.a = P.y = false;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    P.lx = dz(gp.axes[0] || 0);
    P.ly = dz(gp.axes[1] || 0);
    P.rx = dz(gp.axes[2] || 0);
    P.ry = dz(gp.axes[3] || 0);
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    P.a = btn(0);
    P.y = btn(3);
    for (let i = 0; i < gp.buttons.length; i++) {
      const now = btn(i);
      if (now && !this.padPrev[i]) {
        this.edges.add('Pad' + i);
        this.device = 'pad';
      }
      this.padPrev[i] = now;
    }
    if (Math.abs(P.lx) + Math.abs(P.ly) + Math.abs(P.rx) + Math.abs(P.ry) > 0.3) this.device = 'pad';
  }
  pressed(code) {
    return this.edges.has(code);
  }
  move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.pad.lx;
    y -= this.pad.ly;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  interact() {
    return this.pressed('KeyE') || this.pressed('Pad0');
  }
  endFrame() {
    this.edges.clear();
    this.mdx = 0;
    this.mdy = 0;
  }
  rumble(strong = 0.8, weak = 0.5, ms = 700) {
    const gp = this.gamepad;
    if (!gp) return;
    const act = gp.vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    else if (gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(strong, ms);
  }
}
