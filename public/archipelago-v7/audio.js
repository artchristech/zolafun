// Synthesised, positional sound. The context is created/resumed on the first gesture and fades in.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.faded = false;
    this.loops = []; // {kind, x,y,z, level, freq, node}
    this.gullTimer = 6;
    this.surgeTimer = 0;
  }

  // Called on any gesture (click, key, pad). Creating/resuming here is what browsers allow.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      this._build();
    }
    if (this.ctx.state !== 'running') {
      const p = this.ctx.resume();
      if (p && p.then) p.then(() => this._fadeIn()).catch(() => {});
    } else this._fadeIn();
  }

  _fadeIn() {
    if (this.faded || !this.ctx || this.ctx.state !== 'running') return;
    this.faded = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.linearRampToValueAtTime(0.85, t + 3);
  }

  _build() {
    const ctx = this.ctx;
    this.sr = ctx.sampleRate;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const nz = () => rnd() * 2 - 1;
    const buf = (dur, fn) => {
      const n = Math.max(1, Math.floor(dur * this.sr));
      const b = ctx.createBuffer(1, n, this.sr);
      fn(b.getChannelData(0), this.sr, n);
      return b;
    };
    this.noise = buf(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = nz(); });
    // footsteps
    const steps = { sand: [], grass: [], wood: [], stone: [] };
    for (let v = 0; v < 4; v++) {
      const k = 0.85 + v * 0.1;
      steps.sand.push(buf(0.17, (d, sr) => {
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += (nz() - lp) * 0.12 * k;
          d[i] = lp * 3.2 * (1 - Math.exp(-t * 250)) * Math.exp(-t * 26);
        }
      }));
      steps.grass.push(buf(0.14, (d, sr) => {
        let lp = 0, lp2 = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const x = nz();
          lp += (x - lp) * 0.45; lp2 += (x - lp2) * 0.05;
          d[i] = (lp - lp2) * 0.9 * (1 - Math.exp(-t * 400)) * Math.exp(-t * 32) * (0.6 + 0.4 * Math.sin(t * 300 * k));
        }
      }));
      steps.wood.push(buf(0.2, (d, sr) => {
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = Math.sin(6.283 * 150 * k * t) * Math.exp(-t * 28) * 0.8 + Math.sin(6.283 * 390 * k * t) * Math.exp(-t * 45) * 0.35 + nz() * Math.exp(-t * 220) * 0.35;
        }
      }));
      steps.stone.push(buf(0.1, (d, sr) => {
        let prev = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const x = nz();
          d[i] = (x - prev) * 0.45 * Math.exp(-t * 85) + Math.sin(6.283 * 1150 * k * t) * Math.exp(-t * 75) * 0.2 + Math.sin(6.283 * 240 * k * t) * Math.exp(-t * 50) * 0.3;
          prev = x;
        }
      }));
    }
    this.steps = steps;
    this.washBuf = buf(5.5, (d, sr) => {
      let lp = 0, lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 1.1) * Math.exp(-Math.max(0, t - 1.1) * 0.9);
        const cut = 0.02 + 0.2 * env;
        const x = nz();
        lp += (x - lp) * cut;
        lp2 += (x - lp2) * 0.6;
        d[i] = (lp * 2.2 + (lp2 - lp) * 0.25 * Math.max(0, t - 1.0) * env) * env;
      }
    });
    this.crackleBuf = buf(3, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) { lp += (nz() - lp) * 0.03; d[i] = lp * 1.4; }
      for (let k = 0; k < 70; k++) {
        const s = Math.floor(rnd() * (d.length - 2000));
        const a = 0.2 + rnd() * 0.7;
        for (let j = 0; j < 1500; j++) d[s + j] += nz() * a * Math.exp(-j / sr * 500);
      }
    });
    this.hissBuf = buf(1.2, (d, sr) => {
      let prev = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr; const x = nz();
        d[i] = (x - prev) * 0.5 * Math.min(1, t * 30) * Math.exp(-t * 2.8);
        prev = x;
      }
    });
    this.grindBuf = buf(1.3, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (nz() - lp) * 0.08;
        d[i] = lp * 2.5 * (0.5 + 0.5 * Math.abs(Math.sin(t * 28))) * Math.min(1, t * 8) * Math.min(1, (1.3 - t) * 4);
      }
    });
    // ambience: sea + breeze, non-positional
    const sea = ctx.createBufferSource();
    sea.buffer = this.noise; sea.loop = true;
    const seaLp = ctx.createBiquadFilter(); seaLp.type = 'lowpass'; seaLp.frequency.value = 380;
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0.12;
    sea.connect(seaLp); seaLp.connect(this.seaGain); this.seaGain.connect(this.master);
    sea.start();
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise; wind.loop = true; wind.playbackRate.value = 0.7;
    const wBp = ctx.createBiquadFilter(); wBp.type = 'bandpass'; wBp.frequency.value = 900; wBp.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.025;
    this.windBp = wBp;
    wind.connect(wBp); wBp.connect(this.windGain); this.windGain.connect(this.master);
    wind.start();
    this.ready = true;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  get on() { return this.ready && this.ctx.state === 'running'; }

  panner(x, y, z, ref = 6, roll = 1.2, hrtf = false) {
    const p = this.ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 600;
    p.rolloffFactor = roll;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
    p.connect(this.sfx);
    return p;
  }

  setListener(pos, fwd) {
    if (!this.on) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.03); L.positionY.setTargetAtTime(pos.y, t, 0.03); L.positionZ.setTargetAtTime(pos.z, t, 0.03);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.03); L.forwardY.setTargetAtTime(fwd.y, t, 0.03); L.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  _play(buffer, pos, gain = 1, rate = 1, ref = 6) {
    if (!this.on) return;
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g);
    g.connect(pos ? this.panner(pos.x, pos.y, pos.z, ref) : this.sfx);
    s.start();
    return s;
  }

  footstep(surface, pos) {
    if (!this.on) return;
    const set = this.steps[surface] || this.steps.sand;
    const b = set[(Math.random() * set.length) | 0];
    const g = { sand: 0.5, grass: 0.4, wood: 0.55, stone: 0.5 }[surface] || 0.5;
    this._play(b, pos, g, 0.9 + Math.random() * 0.2, 3);
  }

  wash(pos, gain = 0.6) { this._play(this.washBuf, pos, gain, 0.85 + Math.random() * 0.3, 10); }
  hiss(pos) { this._play(this.hissBuf, pos, 0.7, 1, 5); }
  grind(pos) { this._play(this.grindBuf, pos, 0.8, 0.9 + Math.random() * 0.15, 6); }

  tone(freq, pos, { type = 'sine', dur = 1.5, gain = 0.3, attack = 0.005, partials = [[1, 1, 1]], ref = 6 } = {}) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = pos ? this.panner(pos.x, pos.y, pos.z, ref) : this.sfx;
    for (const [mul, amp, dk] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain * amp, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * dk);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur * dk + 0.05);
    }
  }

  chime(freq, pos, gain = 0.25) { this.tone(freq, pos, { dur: 2.4, gain, partials: [[1, 1, 1], [2.76, 0.35, 0.55], [5.4, 0.15, 0.3]] }); }
  click(pos, pitch = 1) { this.tone(900 * pitch, pos, { type: 'square', dur: 0.06, gain: 0.12, partials: [[1, 1, 1], [0.5, 0.6, 1.4]] }); }
  clack(pos) { this.tone(180, pos, { type: 'triangle', dur: 0.25, gain: 0.4, partials: [[1, 1, 1], [2.3, 0.5, 0.5]] }); this._play(this.steps.wood[0], pos, 0.8, 0.7); }
  thunk(pos) { this.tone(70, pos, { type: 'sine', dur: 0.6, gain: 0.5, partials: [[1, 1, 1], [1.5, 0.4, 0.6]] }); }

  gull(pos) {
    if (!this.on) return;
    const ctx = this.ctx;
    const out = this.panner(pos.x, pos.y, pos.z, 12, 1.0, true);
    const n = 2 + ((Math.random() * 3) | 0);
    const base = 1300 + Math.random() * 500;
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 2.5;
      const g = ctx.createGain();
      const d = 0.22 + Math.random() * 0.12;
      o.frequency.setValueAtTime(base * 0.9, t);
      o.frequency.linearRampToValueAtTime(base * 1.35, t + d * 0.3);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(bp); bp.connect(g); g.connect(out);
      o.start(t); o.stop(t + d + 0.05);
      t += d + 0.06 + Math.random() * 0.1;
    }
  }

  ignite(pos) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    s.connect(bp); bp.connect(g); g.connect(this.panner(pos.x, pos.y, pos.z, 10));
    s.start(t); s.stop(t + 2.3);
    this.tone(55, pos, { dur: 1.6, gain: 0.6, partials: [[1, 1, 1]], ref: 10 });
  }

  // swelling chord, not positional; n = how many beacons lit (adds voices)
  chord(n, dur = 5) {
    if (!this.on) return;
    const notes = [146.83, 220, 293.66, 369.99, 440, 587.33];
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < Math.min(notes.length, n + 2); i++) {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = notes[i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06, t + 1.2 + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfx);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  sputter(pos) {
    if (!this.on) return;
    for (let i = 0; i < 5; i++) setTimeout(() => this.tone(120 + Math.random() * 80, pos, { type: 'square', dur: 0.08, gain: 0.15 }), i * 140 + Math.random() * 60);
    setTimeout(() => this.hiss(pos), 650);
  }

  // ---- loops (fire crackle, stone hum): created lazily once audio runs
  addLoop(kind, pos, freq = 110) {
    const l = { kind, x: pos.x, y: pos.y, z: pos.z, level: 0, freq, node: null };
    this.loops.push(l);
    return l;
  }

  _makeLoop(l) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = this.panner(l.x, l.y, l.z, l.kind === 'fire' ? 7 : 4, l.kind === 'fire' ? 1.1 : 1.6);
    g.connect(p);
    if (l.kind === 'fire') {
      const s = ctx.createBufferSource(); s.buffer = this.crackleBuf; s.loop = true;
      s.playbackRate.value = 0.85 + Math.random() * 0.3;
      s.connect(g); s.start(ctx.currentTime + Math.random());
      l.node = { g };
    } else {
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = l.freq;
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = l.freq * 2;
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      o1.connect(g); o2.connect(g2); g2.connect(g);
      o1.start(); o2.start();
      l.node = { g, o1, o2 };
    }
  }

  update(dt) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    for (const l of this.loops) {
      if (!l.node && l.level > 0.001) this._makeLoop(l);
      if (!l.node) continue;
      const max = l.kind === 'fire' ? 0.8 : 0.16;
      l.node.g.gain.setTargetAtTime(l.level * max, t, 0.12);
      if (l.node.o1) {
        l.node.o1.frequency.setTargetAtTime(l.freq, t, 0.25);
        l.node.o2.frequency.setTargetAtTime(l.freq * 2, t, 0.25);
      }
    }
    this.surgeTimer -= dt;
    if (this.surgeTimer < 0) {
      this.surgeTimer = 1.5 + Math.random() * 2;
      this.seaGain.gain.setTargetAtTime(0.07 + Math.random() * 0.1, t, 0.8);
      this.windBp.frequency.setTargetAtTime(600 + Math.random() * 900, t, 1.5);
    }
  }

  setNight(k) {
    if (!this.on) return;
    this.windGain.gain.setTargetAtTime(0.02 + k * 0.03, this.ctx.currentTime, 2);
  }
}
