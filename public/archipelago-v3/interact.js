// Single-press interactions. Items with hold:true repeat while the button stays down
// (the telescope crank keeps clicking round, each click visible).
export class Interactions {
  constructor() {
    this.list = [];
    this.current = null;
    this.holdT = 0;
  }
  add(o) {
    if (o.radius === undefined) o.radius = 2.3;
    if (o.glyphY === undefined) o.glyphY = 1.2;
    this.list.push(o);
    return o;
  }
  update(dt, player, input, blocked) {
    let best = null, bs = 1e9;
    if (!blocked) {
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
      for (const o of this.list) {
        if (!o.enabled()) continue;
        const dx = o.pos.x - player.pos.x, dz = o.pos.z - player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > o.radius) continue;
        if (Math.abs(o.pos.y - (player.pos.y + 1.2)) > 2.8) continue;
        const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        const score = d - facing * 0.9;
        if (score < bs) { bs = score; best = o; }
      }
    }
    if (best !== this.current) this.holdT = 0;
    this.current = best;
    if (!best) return null;
    if (input.interactPressed) {
      best.action();
      player.idleT = 0;
      this.holdT = -0.45;
    } else if (best.hold && input.interactHeld) {
      this.holdT += dt;
      if (this.holdT >= 0) { this.holdT = -0.32; best.action(); player.idleT = 0; }
    }
    return best;
  }
}
