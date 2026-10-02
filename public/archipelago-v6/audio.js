// Five Lights — synthesised sound. Everything is generated with WebAudio; world
// sounds (waves, gulls, fire, the stones' hum) are positional and fade with distance.
export class Sound {
  constructor() {
    this.ctx = null;
    this.emitters = [];
    this.gullT = 6;
    this.listenerPos = { x: 0, y: 0, z: 0 };
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.comp = c.createDynamicsCompressor();
      this.master.connect(this.comp).connect(c.destination);
      this.master.gain.setValueAtTime(0, c.currentTime);
      this.master.gain.linearRampToValueAtTime(0.9, c.currentTime + 3);
      // shared noise
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.crackle = this.makeCrackle();
      // soft wind bed
      const w = this.src(this.noise, true);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
      this.windGain = c.createGain(); this.windGain.gain.value = 0.05;
      w.connect(bp).connect(this.windGain).connect(this.master);
      w.start();
      for (const e of this.emitters) this.build(e);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }
  get ready() { return !!this.ctx; }

  src(buf, loop) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop;
    if (loop) s.loopStart = Math.random() * 0.5;
    return s;
  }
  panner(x, y, z, ref = 6, roll = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 400;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(this.master);
    return p;
  }
  makeCrackle() {
    const c = this.ctx, len = c.sampleRate * 3;
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.04;
      d[i] = lp * 0.9;
      if (Math.random() < 0.0009) {
        const n = 30 + Math.random() * 200, a = 0.3 + Math.random() * 0.7;
        for (let k = 0; k < n && i + k < len; k++) d[i + k] += (Math.random() * 2 - 1) * a * (1 - k / n);
      }
    }
    return b;
  }

  // ---- persistent positional emitters (built lazily once audio unlocks)
  emitter(kind, x, y, z, opts = {}) {
    const e = { kind, x, y, z, level: opts.level ?? 1, freq: opts.freq || 110, ref: opts.ref || 6, built: false };
    this.emitters.push(e);
    if (this.ctx) this.build(e);
    return e;
  }
  build(e) {
    const c = this.ctx;
    e.gain = c.createGain(); e.gain.gain.value = 0;
    e.pan = this.panner(e.x, e.y, e.z, e.ref, e.kind === 'hum' ? 2.2 : 1.1);
    e.gain.connect(e.pan);
    if (e.kind === 'waves') {
      const s = this.src(this.noise, true);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520 + Math.random() * 200;
      const sw = c.createGain(); sw.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.09 + Math.random() * 0.08;
      const lg = c.createGain(); lg.gain.value = 0.45;
      lfo.connect(lg).connect(sw.gain);
      s.connect(lp).connect(sw).connect(e.gain);
      s.start(); lfo.start();
    } else if (e.kind === 'fire') {
      const s = this.src(this.crackle, true);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
      s.connect(hp).connect(e.gain); s.start();
    } else if (e.kind === 'hum') {
      e.osc = c.createOscillator(); e.osc.type = 'sine'; e.osc.frequency.value = e.freq;
      e.osc2 = c.createOscillator(); e.osc2.type = 'triangle'; e.osc2.frequency.value = e.freq * 2;
      const g2 = c.createGain(); g2.gain.value = 0.18;
      e.osc.connect(e.gain); e.osc2.connect(g2).connect(e.gain);
      e.osc.start(); e.osc2.start();
    }
    e.built = true;
  }
  setFreq(e, f) {
    e.freq = f;
    if (e.built) {
      const t = this.ctx.currentTime;
      e.osc.frequency.setTargetAtTime(f, t, 0.25);
      e.osc2.frequency.setTargetAtTime(f * 2, t, 0.25);
    }
  }

  update(dt, cam, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    this.listenerPos = cam;
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.x, t, 0.03); L.positionY.setTargetAtTime(cam.y, t, 0.03); L.positionZ.setTargetAtTime(cam.z, t, 0.03);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.03); L.forwardY.setTargetAtTime(fwd.y, t, 0.03); L.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(cam.x, cam.y, cam.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    for (const e of this.emitters) {
      if (!e.built) continue;
      const base = e.kind === 'waves' ? 0.5 : e.kind === 'fire' ? 0.9 : 0.12;
      e.gain.gain.setTargetAtTime(base * e.level, t, 0.15);
    }
    this.gullT -= dt;
    if (this.gullT < 0) {
      this.gullT = 7 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 40;
      this.gull(cam.x + Math.cos(a) * r, cam.y + 10 + Math.random() * 10, cam.z + Math.sin(a) * r);
    }
  }
  setNight(n) { if (this.windGain) this.windGain.gain.setTargetAtTime(0.05 + n * 0.04, this.ctx.currentTime, 1); }

  // ---- one-shots
  out(pos, ref = 5) { return pos ? this.panner(pos.x, pos.y, pos.z, ref, 1.3) : this.master; }
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  noiseHit(dest, type, f, q, peak, dur, t0 = 0, sweepTo = 0) {
    const c = this.ctx, t = c.currentTime + t0;
    const s = this.src(this.noise, false);
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    this.env(g, t, Math.min(0.01, dur * 0.2), peak, dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
  }
  tone(dest, type, f, peak, dur, t0 = 0, f2 = 0, a = 0.005) {
    const c = this.ctx, t = c.currentTime + t0;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    this.env(g, t, a, peak, dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
  }
  step(surf) {
    if (!this.ctx) return;
    const m = this.master, v = 0.8 + Math.random() * 0.4;
    if (surf === 'wood') {
      this.tone(m, 'sine', 150 * v, 0.35, 0.12, 0, 80);
      this.noiseHit(m, 'bandpass', 900 * v, 2, 0.25, 0.06);
    } else if (surf === 'stone') {
      this.noiseHit(m, 'bandpass', 2800 * v, 1.4, 0.3, 0.045);
      this.tone(m, 'triangle', 240 * v, 0.08, 0.05);
    } else if (surf === 'grass') {
      this.noiseHit(m, 'bandpass', 2300 * v, 0.6, 0.12, 0.1);
    } else {
      this.noiseHit(m, 'lowpass', 750 * v, 0.7, 0.32, 0.14);
    }
  }
  play(name, pos, arg) {
    if (!this.ctx) return;
    const o = this.out(pos);
    switch (name) {
      case 'bell': {
        const f = arg || 440;
        this.tone(o, 'sine', f, 0.35, 2.2);
        this.tone(o, 'sine', f * 2.76, 0.12, 1.2);
        this.tone(o, 'sine', f * 5.4, 0.05, 0.6);
        break;
      }
      case 'click': this.tone(o, 'square', 1400, 0.12, 0.03); this.noiseHit(o, 'highpass', 3000, 1, 0.25, 0.04, 0.02); break;
      case 'clack': this.tone(o, 'triangle', 320, 0.3, 0.08, 0, 180); this.noiseHit(o, 'bandpass', 1800, 2, 0.3, 0.06); break;
      case 'grind': this.noiseHit(o, 'lowpass', 300, 1, 0.5, 1.1, 0, 120); this.tone(o, 'sawtooth', 55, 0.08, 1.0); break;
      case 'wrong':
        this.tone(o, 'sine', 120, 0.45, 0.5, 0, 50);
        this.noiseHit(o, 'lowpass', 1400, 0.8, 0.4, 0.7, 0.05, 300);
        break;
      case 'splash': this.noiseHit(o, 'lowpass', 1600, 0.6, 0.5, 0.8, 0, 400); break;
      case 'step-ok': this.tone(o, 'sine', arg || 660, 0.18, 0.5); break;
      case 'chime': [523, 659, 784, 1047].forEach((f, i) => this.tone(o, 'sine', f, 0.2, 1.4, i * 0.12)); break;
      case 'whoosh':
        this.noiseHit(o, 'bandpass', 250, 0.9, 0.7, 1.4, 0, 2800);
        this.tone(o, 'sine', 70, 0.4, 1.2, 0, 45, 0.2);
        break;
      case 'tick': this.tone(o, 'square', 2200, 0.08, 0.02); this.tone(o, 'square', 1700, 0.06, 0.02, 0.25); break;
      case 'clunk': this.tone(o, 'triangle', 90, 0.5, 0.3, 0, 60); this.noiseHit(o, 'lowpass', 800, 1, 0.3, 0.2); break;
      case 'sputter': for (let i = 0; i < 6; i++) this.noiseHit(o, 'bandpass', 600 + Math.random() * 900, 1, 0.3, 0.08, i * 0.09); break;
      case 'wash':
        for (let i = 0; i < 4; i++) this.noiseHit(o, 'lowpass', 1100, 0.5, 0.45, 1.6, i * 1.3, 350);
        break;
      case 'finale': {
        const notes = [130.8, 196, 261.6, 329.6, 392, 523.3];
        notes.forEach((f, i) => {
          const c = this.ctx, t = c.currentTime + i * 0.6;
          const os = c.createOscillator(); os.type = 'triangle'; os.frequency.value = f;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.07, t + 3); g.gain.linearRampToValueAtTime(0.0001, t + 14);
          os.connect(g).connect(this.master); os.start(t); os.stop(t + 14.5);
        });
        break;
      }
    }
  }
  gull(x, y, z) {
    const o = this.panner(x, y, z, 10, 1);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const c = this.ctx, t = c.currentTime + i * (0.32 + Math.random() * 0.1);
      const os = c.createOscillator(); os.type = 'sawtooth';
      const f = 1250 + Math.random() * 300;
      os.frequency.setValueAtTime(f * 0.8, t);
      os.frequency.linearRampToValueAtTime(f, t + 0.05);
      os.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.28);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 3;
      const g = c.createGain();
      this.env(g, t, 0.02, 0.22, 0.28);
      os.connect(bp).connect(g).connect(o);
      os.start(t); os.stop(t + 0.35);
    }
  }
}
