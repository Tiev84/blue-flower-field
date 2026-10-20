// Sounds: the meow sample (pitched per cat), a soft breeze with the odd
// bird, and a little music-box melody for the ending. Web Audio only starts
// after the Start tap (iOS needs a gesture).
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.meow = null; }

  async start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.verb = this.makeReverb();
    this.verb.connect(this.master);
    try {
      const buf = await (await fetch('sounds/meow.mp3')).arrayBuffer();
      this.meow = await new Promise((res, rej) => this.ctx.decodeAudioData(buf, res, rej));
    } catch (e) { console.warn('meow sound unavailable', e); }
    this.breeze();
  }

  makeReverb() {
    const c = this.ctx, len = c.sampleRate * 2.2, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const v = c.createConvolver(); v.buffer = b;
    const g = c.createGain(); g.gain.value = 0.35; v.connect(g);
    const input = c.createGain(); input.connect(v);
    g.connect = g.connect.bind(g);
    input.out = g;
    return { input, connect: (n) => g.connect(n) };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  playMeow(rate = 1) {
    if (!this.ctx || !this.meow) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.meow; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = 0.9;
    s.connect(g); g.connect(this.master); g.connect(this.verb.input);
    s.start();
  }

  breeze() {
    const c = this.ctx;
    const len = c.sampleRate * 4, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.015; d[i] = last * 3; }
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g = c.createGain(); g.gain.value = 0.18;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 0.08; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    const chirp = () => {
      if (!this.ctx) return;
      if (!this.muted) this.bird();
      setTimeout(chirp, 4000 + Math.random() * 9000);
    };
    setTimeout(chirp, 3000);
  }

  bird() {
    const c = this.ctx, t = c.currentTime, n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain(), t0 = t + i * 0.13;
      o.type = 'sine'; o.frequency.setValueAtTime(base, t0); o.frequency.exponentialRampToValueAtTime(base * 1.45, t0 + 0.07); o.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + 0.1);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.035, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      o.connect(g); g.connect(this.master); g.connect(this.verb.input); o.start(t0); o.stop(t0 + 0.12);
    }
  }

  note(freq, t0, dur = 1.6, vol = 0.12) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq; o2.type = 'triangle'; o2.frequency.value = freq * 2;
    const g2 = c.createGain(); g2.gain.value = 0.18;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.master); g.connect(this.verb.input);
    o.start(t0); o2.start(t0); o.stop(t0 + dur); o2.stop(t0 + dur);
  }

  sparkle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [1568, 2093, 2637, 3136].forEach((f, i) => this.note(f, t + i * 0.06, 0.8, 0.05));
  }

  // a rising shimmer while the light comes down
  shimmer(dur = 3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    for (let i = 0; i < 18; i++) this.note(scale[i % scale.length] * (i >= 8 ? 2 : 1) / (i >= 16 ? 2 : 1), t + (i / 18) * dur, 1.2, 0.05);
  }

  // music box: a short gentle tune for the bouquet
  tune() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, B4: 493.88, A4: 440, G4: 392 };
    const seq = [['E5', 0], ['G5', 0.35], ['C6', 0.7], ['B4', 1.2], ['A5', 1.55], ['G5', 1.9], ['E5', 2.4], ['D5', 2.75], ['E5', 3.1], ['G5', 3.45], ['C5', 3.9], ['E5', 4.6], ['G5', 4.6], ['C6', 4.6]];
    for (const [n, dt] of seq) this.note(N[n], t + dt, 2.2, 0.1);
    for (const [n, dt] of [['C5', 0], ['G4', 1.2], ['A4', 2.4], ['G4', 3.6], ['C5', 4.6]]) this.note(N[n] / 2, t + dt, 2.6, 0.07);
  }
}
