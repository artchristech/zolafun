// Procedural WebAudio: sea, wind, footsteps, waves, gulls, hum, fire, bells.
export class GameAudio {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ok = !!AC;
    if (!this.ok) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.faded = false;
    this.lx = 0; this.ly = 0; this.lz = 0; this.rx = 1; this.rz = 0;

    const sr = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, sr * 2, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, sr * 4, sr);
    const bd = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.startAmbient();
    this.gullT = 4;
    this.crackleAcc = 0;
  }

  unlock() {
    if (!this.ok) return;
    if (this.ctx.state !== 'running') {
      const p = this.ctx.resume();
      if (p && p.then) p.then(() => this._fadeIn()).catch(() => {});
    } else this._fadeIn();
  }
  _fadeIn() {
    if (this.faded || this.ctx.state !== 'running') return;
    this.faded = true;
    const t = this.ctx.currentTime, g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.9, t + 2.8);
  }
  get running() { return this.ok && this.ctx.state === 'running'; }

  setListener(pos, yaw) {
    this.lx = pos.x; this.ly = pos.y; this.lz = pos.z;
    // camera right vector for yaw (camera looks along -forward)
    this.rx = Math.cos(yaw); this.rz = -Math.sin(yaw);
  }

  // distance gain + stereo pan for a world position
  _spatial(x, y, z, vol, ref = 10) {
    const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const g = vol * ref / (ref + Math.max(0, d - 2));
    const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * this.rx + dz * this.rz) / d)) * 0.85 : 0;
    const out = this.ctx.createGain(); out.gain.value = 1;
    let node = out;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); p.connect(this.sfx); }
    else out.connect(this.sfx);
    return { node, g };
  }

  _noiseSrc(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf || this.noise; return s; }

  _env(g, t, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  startAmbient() {
    const ctx = this.ctx;
    // sea
    const sea = this._noiseSrc(this.brown); sea.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0.32;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.075;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.14;
    lfo.connect(lfoG); lfoG.connect(this.seaGain.gain);
    sea.connect(lp); lp.connect(this.seaGain); this.seaGain.connect(this.amb);
    sea.start(); lfo.start();
    // wind
    const wind = this._noiseSrc(); wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.045;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.11;
    const wlg = ctx.createGain(); wlg.gain.value = 0.03;
    wl.connect(wlg); wlg.connect(this.windGain.gain);
    const wl2 = ctx.createOscillator(); wl2.frequency.value = 0.05;
    const wl2g = ctx.createGain(); wl2g.gain.value = 180;
    wl2.connect(wl2g); wl2g.connect(bp.frequency);
    wind.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.amb);
    wind.start(); wl.start(); wl2.start();
    // monolith hum
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 900;
    this.humGain.connect(hf); hf.connect(this.amb);
    for (const [f, v] of [[55, 0.5], [110, 0.4], [110.7, 0.35], [165, 0.18], [220.4, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = v;
      o.connect(g); g.connect(this.humGain); o.start();
    }
    this.chordGain = ctx.createGain(); this.chordGain.gain.value = 0;
    this.chordGain.connect(hf);
    for (const f of [138.6, 164.8, 277.2, 329.6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.08;
      o.connect(g); g.connect(this.chordGain); o.start();
    }
    // night crickets bed (very soft)
    this.nightGain = ctx.createGain(); this.nightGain.gain.value = 0;
    const cr = this._noiseSrc(); cr.loop = true;
    const cbp = ctx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 4200; cbp.Q.value = 8;
    const am = ctx.createOscillator(); am.frequency.value = 7; const amg = ctx.createGain(); amg.gain.value = 0.5;
    const crg = ctx.createGain(); crg.gain.value = 0.5;
    am.connect(amg); amg.connect(crg.gain);
    cr.connect(cbp); cbp.connect(crg); crg.connect(this.nightGain); this.nightGain.connect(this.amb);
    cr.start(); am.start();
  }

  setHum(level, chord) {
    if (!this.ok) return;
    if (this._hum && Math.abs(this._hum[0] - level) < 0.02 && this._hum[1] === chord) return;
    this._hum = [level, chord];
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(level * 0.22, t, 0.4);
    this.chordGain.gain.setTargetAtTime(chord * level * 0.5, t, 0.8);
  }

  setNight(n, nearSea) {
    if (!this.ok) return;
    if (this._night && Math.abs(this._night[0] - n) < 0.02 && Math.abs(this._night[1] - nearSea) < 0.05) return;
    this._night = [n, nearSea];
    const t = this.ctx.currentTime;
    this.nightGain.gain.setTargetAtTime(n * 0.012, t, 1.0);
    this.seaGain.gain.setTargetAtTime(0.18 + 0.2 * nearSea, t, 1.0);
  }

  footstep(surface, x, y, z) {
    if (!this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const { node } = this._spatial(x, y, z, 1);
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const r = Math.random();
    let dur = 0.1, peak = 0.2;
    if (surface === 'sand') { f.type = 'lowpass'; f.frequency.value = 800 + r * 400; dur = 0.17; peak = 0.34; }
    else if (surface === 'grass') { f.type = 'bandpass'; f.frequency.value = 1800 + r * 600; f.Q.value = 0.6; dur = 0.12; peak = 0.2; }
    else if (surface === 'wood') {
      f.type = 'bandpass'; f.frequency.value = 650 + r * 150; f.Q.value = 1.4; dur = 0.08; peak = 0.34;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(170 + r * 20, t); o.frequency.exponentialRampToValueAtTime(85, t + 0.1);
      const og = ctx.createGain(); this._env(og, t, 0.35, 0.004, 0.12);
      o.connect(og); og.connect(node); o.start(t); o.stop(t + 0.2);
    } else if (surface === 'stone') {
      f.type = 'highpass'; f.frequency.value = 1500 + r * 800; dur = 0.05; peak = 0.28;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 380 + r * 80;
      const og = ctx.createGain(); this._env(og, t, 0.1, 0.002, 0.05);
      o.connect(og); og.connect(node); o.start(t); o.stop(t + 0.1);
    } else if (surface === 'water') { f.type = 'bandpass'; f.frequency.value = 1100 + r * 500; f.Q.value = 0.9; dur = 0.22; peak = 0.3; }
    this._env(g, t, peak, 0.008, dur);
    src.connect(f); f.connect(g); g.connect(node);
    src.start(t, Math.random() * 1.5, dur + 0.1);
  }

  wave(x, y, z, vol = 0.5) {
    if (!this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const { node, g: dg } = this._spatial(x, y, z, vol, 18);
    const src = this._noiseSrc(this.brown);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1500, t + 0.9);
    f.frequency.linearRampToValueAtTime(420, t + 2.4);
    const src2 = this._noiseSrc();
    const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(dg * 1.6, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t + 0.5);
    g2.gain.linearRampToValueAtTime(dg * 0.25, t + 1.0);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    src.connect(f); f.connect(g); g.connect(node);
    src2.connect(f2); f2.connect(g2); g2.connect(node);
    src.start(t, Math.random() * 1.2, 2.8); src2.start(t, Math.random(), 2.6);
  }

  gull(x, y, z) {
    if (!this.running) return;
    const ctx = this.ctx;
    const { node, g: dg } = this._spatial(x, y, z, 0.18, 40);
    const n = 2 + Math.floor(Math.random() * 3);
    let t = ctx.currentTime;
    const base = 1050 + Math.random() * 300;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.45, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.34);
      const vib = ctx.createOscillator(); vib.frequency.value = 28; const vg = ctx.createGain(); vg.gain.value = 35;
      vib.connect(vg); vg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 2.5;
      const g = ctx.createGain(); this._env(g, t, dg, 0.03, 0.32);
      o.connect(f); f.connect(g); g.connect(node);
      o.start(t); o.stop(t + 0.42); vib.start(t); vib.stop(t + 0.42);
      t += 0.32 + Math.random() * 0.12;
    }
  }

  crackle(level) {
    if (!this.running || level <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800 + Math.random() * 2500;
    const g = ctx.createGain(); this._env(g, t, level * (0.05 + Math.random() * 0.12), 0.001, 0.015 + Math.random() * 0.03);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 1.8, 0.08);
  }

  bell(freq, vol = 0.3, pos = null, delay = 0) {
    if (!this.running) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    let node = this.sfx, dg = vol;
    if (pos) { const s = this._spatial(pos.x, pos.y, pos.z, vol, 16); node = s.node; dg = s.g; }
    for (const [m, a, d] of [[1, 1, 2.6], [2.0, 0.45, 1.6], [2.76, 0.3, 1.1], [5.4, 0.12, 0.5]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
      const g = ctx.createGain(); this._env(g, t, dg * a, 0.004, d);
      o.connect(g); g.connect(node); o.start(t); o.stop(t + d + 0.1);
    }
  }

  click(kind, pos) {
    if (!this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const { node, g: dg } = pos ? this._spatial(pos.x, pos.y, pos.z, 1, 12) : { node: this.sfx, g: 1 };
    if (kind === 'stone') {
      const src = this._noiseSrc(this.brown);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = ctx.createGain(); this._env(g, t, dg * 0.9, 0.03, 0.3);
      src.connect(f); f.connect(g); g.connect(node); src.start(t, Math.random(), 0.45);
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.2);
      const og = ctx.createGain(); this._env(og, t + 0.22, dg * 0.4, 0.005, 0.2);
      o.connect(og); og.connect(node); o.start(t); o.stop(t + 0.5);
    } else if (kind === 'metal') {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1900;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 6;
      const g = ctx.createGain(); this._env(g, t, dg * 0.25, 0.001, 0.07);
      o.connect(f); f.connect(g); g.connect(node); o.start(t); o.stop(t + 0.12);
      const src = this._noiseSrc(); const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 3000;
      const g2 = ctx.createGain(); this._env(g2, t, dg * 0.3, 0.001, 0.03);
      src.connect(hf); hf.connect(g2); g2.connect(node); src.start(t, Math.random(), 0.06);
    } else if (kind === 'wood') {
      const src = this._noiseSrc();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
      const g = ctx.createGain(); this._env(g, t, dg * 0.5, 0.002, 0.08);
      src.connect(f); f.connect(g); g.connect(node); src.start(t, Math.random(), 0.12);
    }
  }

  snuff(pos) {
    if (!this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const { node, g: dg } = this._spatial(pos.x, pos.y, pos.z, 1, 14);
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2600;
    const g = ctx.createGain(); this._env(g, t, dg * 0.3, 0.01, 0.6);
    src.connect(f); f.connect(g); g.connect(node); src.start(t, Math.random(), 0.7);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
    const og = ctx.createGain(); this._env(og, t, dg * 0.5, 0.005, 0.35);
    o.connect(og); og.connect(node); o.start(t); o.stop(t + 0.5);
  }

  ignite(pos, big = false) {
    if (!this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const { node, g: dg } = this._spatial(pos.x, pos.y, pos.z, 1, 25);
    const src = this._noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.7);
    const g = ctx.createGain(); this._env(g, t, dg * 0.7, 0.25, 1.1);
    src.connect(f); f.connect(g); g.connect(node); src.start(t, 0, 1.6);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(38, t + 1.2);
    const og = ctx.createGain(); this._env(og, t, dg * 0.6, 0.05, 1.3);
    o.connect(og); og.connect(node); o.start(t); o.stop(t + 1.5);
    const notes = big ? [392, 523.3, 659.3, 784, 1046.5] : [523.3, 659.3, 784];
    notes.forEach((n, i) => this.bell(n, 0.16, null, 0.35 + i * 0.16));
  }

  unlockChime() {
    [392, 493.9, 587.3].forEach((n, i) => this.bell(n, 0.14, null, i * 0.14));
  }
  softChime() { [659.3, 784].forEach((n, i) => this.bell(n, 0.08, null, i * 0.2)); }

  finale() {
    if (!this.running) return;
    const scale = [392, 440, 523.3, 587.3, 659.3, 784, 880, 1046.5];
    for (let i = 0; i < 40; i++) {
      const n = scale[(i * 3 + Math.floor(i / 5)) % scale.length];
      this.bell(n, 0.1 * (1 - i / 50), null, 0.8 + i * 0.42);
    }
    const ctx = this.ctx, t = ctx.currentTime;
    for (const fq of [98, 146.8, 196, 246.9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 5); g.gain.linearRampToValueAtTime(0.035, t + 16); g.gain.linearRampToValueAtTime(0.0001, t + 26);
      o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 27);
    }
  }

  update(dt, listenerPos, fireLevel, gullChance) {
    if (!this.ok) return;
    if (!this.faded && this.ctx.state === 'running') this._fadeIn();
    this.crackleAcc += dt * fireLevel * 16;
    while (this.crackleAcc > 1) { this.crackleAcc -= 1 + Math.random(); this.crackle(fireLevel); }
    this.gullT -= dt;
    if (this.gullT <= 0) {
      this.gullT = 7 + Math.random() * 16;
      if (Math.random() < gullChance) {
        const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 40;
        this.gull(listenerPos.x + Math.cos(a) * r, listenerPos.y + 20, listenerPos.z + Math.sin(a) * r);
      }
    }
  }
}
