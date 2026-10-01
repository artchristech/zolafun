// All sound is synthesised with WebAudio: sea, wind, gulls, footsteps per
// surface, causeway washes, fire, the monolith hum, bells and chimes.
// The context starts suspended; the first click or key resumes it and the
// master volume fades in.
export class Audio {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = null;
    try { this.ctx = AC ? new AC() : null; } catch (e) { this.ctx = null; }
    this.unlocked = false;
    this.t = 0;
    this.gullT = 5;
    this.crackT = 0;
    if (!this.ctx) return;
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 1; this.amb.connect(this.master);
    // noise buffers
    const len = c.sampleRate * 2;
    this.white = c.createBuffer(1, len, c.sampleRate);
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }
  }

  unlock() {
    const c = this.ctx;
    if (!c) return;
    if (c.state !== 'running') c.resume().then(() => this._running()).catch(() => {});
    else this._running();
  }
  _running() {
    if (this.unlocked || this.ctx.state !== 'running') return;
    this.unlocked = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.linearRampToValueAtTime(0.9, t + 2.5);
    this._ambient();
  }

  _loop(buf, filterType, freq, q, dest) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    s.loopStart = Math.random(); s.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(c.currentTime, Math.random() * 1.5);
    return { s, f, g };
  }
  _ambient() {
    const c = this.ctx;
    this.ocean = this._loop(this.brown, 'lowpass', 520, 0.5, this.amb);
    this.surf = this._loop(this.white, 'bandpass', 1100, 0.6, this.amb);
    this.wind = this._loop(this.white, 'bandpass', 480, 1.4, this.amb);
    this.fire = this._loop(this.brown, 'bandpass', 380, 0.8, this.amb);
    // monolith hum: a centre drone (harmonics) + one voice per stone
    this.humG = c.createGain(); this.humG.gain.value = 0; this.humG.connect(this.master);
    this.humFilter = c.createBiquadFilter(); this.humFilter.type = 'lowpass'; this.humFilter.frequency.value = 900;
    this.humFilter.connect(this.humG);
    this.drone = [];
    this.voices = [];
    for (let i = 0; i < 5; i++) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 100;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.humFilter); o.start();
      this.drone.push({ o, g });
      const v = c.createOscillator(); v.type = 'sine'; v.frequency.value = 100;
      const vg = c.createGain(); vg.gain.value = 0;
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      v.connect(vg);
      if (p) { vg.connect(p); p.connect(this.humFilter); } else vg.connect(this.humFilter);
      v.start();
      this.voices.push({ o: v, g: vg, p });
    }
  }

  _panner(pos, ref = 6, roll = 1) {
    const c = this.ctx;
    const p = c.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 2000;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }
  _dest(pos, ref, roll) { return pos ? this._panner(pos, ref, roll) : this.sfx; }
  _tone(freq, type, t, dur, vol, dest, slideTo = 0, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  _noise(t, dur, vol, type, freq, q, dest, slideTo = 0, attack = 0.004, buf = null) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = buf || this.white; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  get ok() { return this.ctx && this.unlocked; }

  footstep(surf, vol = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, r = 0.9 + Math.random() * 0.2, d = this.sfx;
    if (surf === 'wood') {
      this._tone(150 * r, 'sine', t, 0.11, 0.32 * vol, d, 85);
      this._noise(t, 0.06, 0.16 * vol, 'bandpass', 900 * r, 3, d);
    } else if (surf === 'stone') {
      this._noise(t, 0.035, 0.22 * vol, 'highpass', 2600 * r, 0.7, d);
      this._tone(240 * r, 'triangle', t, 0.05, 0.1 * vol, d, 140);
    } else if (surf === 'grass') {
      this._noise(t, 0.08, 0.12 * vol, 'bandpass', 2600 * r, 0.8, d);
      this._noise(t, 0.06, 0.1 * vol, 'lowpass', 500, 0.7, d);
    } else {
      this._noise(t, 0.12, 0.2 * vol, 'lowpass', 1000 * r, 0.6, d, 500, 0.02);
      this._noise(t + 0.02, 0.08, 0.07 * vol, 'bandpass', 3200 * r, 0.8, d);
    }
  }
  click(pos, pitch = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, d = this._dest(pos, 5);
    this._tone(1700 * pitch, 'square', t, 0.03, 0.12, d);
    this._noise(t, 0.05, 0.3, 'bandpass', 2400 * pitch, 2, d);
    this._tone(320 * pitch, 'triangle', t + 0.01, 0.12, 0.25, d, 200);
  }
  gear(pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, d = this._dest(pos, 5);
    for (let i = 0; i < 3; i++) this._noise(t + 0.05 + i * 0.07, 0.03, 0.15, 'bandpass', 3000 + i * 300, 3, d);
  }
  stoneGrind(pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, d = this._dest(pos, 6);
    this._noise(t, 0.35, 0.4, 'lowpass', 500, 1, d, 250, 0.03, this.brown);
    this._tone(70, 'triangle', t, 0.3, 0.2, d, 55);
    this._tone(1200, 'square', t + 0.28, 0.025, 0.06, d);
  }
  whoosh() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.6, 0.12, 'bandpass', 300, 1.2, this.sfx, 1400, 0.25);
  }
  ignite(pos, size = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, d = this._dest(pos, 12 * size, 0.6);
    this._noise(t, 1.0 * size + 0.3, 0.7, 'lowpass', 200, 0.8, d, 3500, 0.2, this.white);
    this._tone(80, 'sine', t, 1.6 * size, 0.55 * size, d, 38, 0.02);
    if (size >= 1) {
      const notes = [220, 277.2, 329.6, 440, 554.4];
      notes.forEach((f, i) => this._tone(f, 'triangle', t + 0.3 + i * 0.09, 3.2, 0.07, this.sfx, 0, 0.6));
    }
  }
  chimeStep(k) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const scale = [392, 440, 523.3, 587.3, 659.3, 784];
    this._tone(scale[Math.min(k, 5)], 'sine', t + 0.25, 1.4, 0.18, this.sfx, 0, 0.01);
    this._tone(scale[Math.min(k, 5)] * 2, 'sine', t + 0.25, 0.8, 0.05, this.sfx);
  }
  chime() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => { this._tone(f, 'sine', t + i * 0.14, 1.8, 0.16, this.sfx, 0, 0.01); this._tone(f * 2.01, 'sine', t + i * 0.14, 0.8, 0.04, this.sfx); });
  }
  bells(pos, n) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, d = this._dest(pos, 7);
    const base = 330 * Math.pow(2, ((n - 1) * 2) / 12);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.13, f = base * (1 + i * 0.07);
      const car = c.createOscillator(); car.frequency.value = f;
      const mod = c.createOscillator(); mod.frequency.value = f * 2.76;
      const mg = c.createGain(); mg.gain.setValueAtTime(f * 2.2, tt); mg.gain.exponentialRampToValueAtTime(1, tt + 1.2);
      mod.connect(mg); mg.connect(car.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.16, tt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.2);
      car.connect(g); g.connect(d);
      car.start(tt); mod.start(tt); car.stop(tt + 2.3); mod.stop(tt + 2.3);
    }
  }
  reset(pos, big) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + 0.35, d = this._dest(pos, 8);
    this._tone(140, 'triangle', t, 0.7, 0.35, d, 55);
    this._tone(147, 'triangle', t, 0.7, 0.25, d, 52);
    if (big) this._noise(t, 0.9, 0.35, 'lowpass', 2000, 0.7, d, 300, 0.01);
  }
  wash(pos, strength = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, d = this._dest(pos, 30, 0.7);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 1.6 + Math.random() * 0.4;
      this._noise(tt, 2.6, 0.5 * strength, 'bandpass', 350, 0.7, d, 1800, 1.0, this.white);
      this._noise(tt + 0.8, 2.2, 0.3 * strength, 'lowpass', 1200, 0.5, d, 300, 0.3, this.brown);
    }
  }
  gull(pos) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, d = this._dest(pos, 15, 0.8);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.28 + Math.random() * 0.12);
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f0 = 1350 + Math.random() * 300;
      o.frequency.setValueAtTime(f0 * 0.75, tt); o.frequency.linearRampToValueAtTime(f0, tt + 0.06); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, tt + 0.26);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 2.5;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.14, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.27);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(tt); o.stop(tt + 0.3);
    }
  }
  finale() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const chord = [110, 164.8, 220, 277.2, 329.6, 440, 659.3];
    chord.forEach((f, i) => {
      this._tone(f, i < 3 ? 'triangle' : 'sine', t + i * 0.4, 14, 0.06, this.sfx, 0, 3.5);
      this._tone(f * 1.003, 'sine', t + i * 0.4 + 0.2, 13, 0.04, this.sfx, 0, 3.5);
    });
  }
  setHum(level, F0, harm, stones, solved) {
    if (!this.ok || !this.humG) return;
    const t = this.ctx.currentTime;
    this.humG.gain.setTargetAtTime(level * (0.2 + solved * 0.1), t, 0.15);
    for (let i = 0; i < 5; i++) {
      this.drone[i].o.frequency.setTargetAtTime(F0 * harm[i], t, 0.05);
      this.drone[i].g.gain.setTargetAtTime(0.28 / (harm[i] * 0.8 + 0.4), t, 0.1);
      const v = this.voices[i], s = stones[i];
      v.o.frequency.setTargetAtTime(s.freq, t, 0.08);
      v.g.gain.setTargetAtTime(s.gain * 0.3, t, 0.1);
      if (v.p) v.p.pan.setTargetAtTime(s.pan * 0.8, t, 0.1);
    }
    this.humFilter.frequency.setTargetAtTime(700 + solved * 1600, t, 0.5);
  }
  update(dt, p) {
    if (!this.ok || !this.ocean) return;
    this.t += dt;
    const c = this.ctx, t = c.currentTime, L = c.listener;
    // listener follows the camera
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.cx, t, 0.05); L.positionY.setTargetAtTime(p.cy, t, 0.05); L.positionZ.setTargetAtTime(p.cz, t, 0.05);
      L.forwardX.setTargetAtTime(fx, t, 0.05); L.forwardY.setTargetAtTime(0, t, 0.05); L.forwardZ.setTargetAtTime(fz, t, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) { L.setPosition(p.cx, p.cy, p.cz); L.setOrientation(fx, 0, fz, 0, 1, 0); }
    const alt = Math.max(0, Math.min(1, (p.py - 6) / 34));
    const swell = 0.5 + 0.5 * Math.sin(this.t * 0.45) * Math.sin(this.t * 0.17 + 1);
    this.ocean.g.gain.setTargetAtTime((0.42 + 0.2 * swell) * (1 - alt * 0.55) * (0.6 + 0.4 * p.shore), t, 0.3);
    this.surf.g.gain.setTargetAtTime((0.03 + 0.09 * swell) * p.shore * (1 - alt * 0.7), t, 0.3);
    this.wind.g.gain.setTargetAtTime(0.02 + alt * 0.12 + p.night * 0.03, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(420 + 200 * Math.sin(this.t * 0.3), t, 0.5);
    const fireLvl = Math.max(0, 1 - p.fireDist / 26);
    this.fire.g.gain.setTargetAtTime(fireLvl * 0.35, t, 0.2);
    this.crackT -= dt;
    if (fireLvl > 0.05 && this.crackT < 0) {
      this.crackT = 0.04 + Math.random() * 0.25;
      this._noise(t, 0.02 + Math.random() * 0.03, fireLvl * (0.15 + Math.random() * 0.3), 'bandpass', 1500 + Math.random() * 3000, 1.5, this.sfx);
    }
    // gulls now and then, fewer as night falls
    this.gullT -= dt;
    if (this.gullT < 0) {
      this.gullT = 7 + Math.random() * 14 + p.night * 25;
      if (Math.random() > p.night * 0.85) {
        const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 25;
        this.gull({ x: p.cx + Math.cos(a) * r, y: p.cy + 15 + Math.random() * 10, z: p.cz + Math.sin(a) * r });
      }
    }
  }
}
