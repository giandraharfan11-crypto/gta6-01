// Procedural WebAudio: engine, siren, gunshots, crashes, cash jingles, tropical pad loop.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.started = false;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    this.musicTimer = 0; this.chordIdx = 0;
  }
  ensure() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC(); this.started = true;
      const master = this.ctx.createGain(); master.gain.value = 0.5; master.connect(this.ctx.destination);
      this.master = master;
      // engine: sawtooth through lowpass, pitch follows speed
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      const ef = this.ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 420;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(ef); ef.connect(this.engineGain); this.engineGain.connect(master); this.engineOsc.start();
      // siren: triangle swept by LFO
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 750;
      this.sirenLfo = this.ctx.createOscillator(); this.sirenLfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 180;
      this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(master);
      this.sirenOsc.start(); this.sirenLfo.start();
    } catch (e) { /* audio unavailable: stay silent */ }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.18, vol = 0.3) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
  shot() { this.noise(0.09, 0.35); this.tone(160, 0.08, 'square', 0.18, 0, 60); }
  crash(big = false) { this.noise(big ? 0.35 : 0.18, big ? 0.5 : 0.3); this.tone(90, 0.2, 'sine', 0.25, 0, 40); }
  cash() { [880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.18, i * 0.07)); }
  fail() { this.tone(220, 0.3, 'sawtooth', 0.15, 0, 110); this.tone(165, 0.4, 'sawtooth', 0.15, 0.25, 82); }
  door() { this.tone(300, 0.07, 'square', 0.1, 0, 180); }
  update(dt, speedRatio, inCar, policeNear, wanted) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) {
      const target = inCar && !this.muted ? 0.05 + Math.abs(speedRatio) * 0.06 : 0;
      this.engineGain.gain.setTargetAtTime(target, t, 0.08);
      this.engineOsc.frequency.setTargetAtTime(55 + Math.abs(speedRatio) * 165, t, 0.08);
    }
    if (this.sirenGain) {
      const target = wanted > 0 && policeNear && !this.muted ? 0.035 : 0;
      this.sirenGain.gain.setTargetAtTime(target, t, 0.2);
    }
    // tropical pad: slow chord loop (Am7 – Fmaj7 – Cmaj7 – G6), very quiet
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && !this.muted) {
      this.musicTimer = 4;
      const chords = [[220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [130.8, 164.8, 196, 261.6], [196, 246.9, 293.7, 392]];
      const ch = chords[this.chordIdx % chords.length]; this.chordIdx++;
      ch.forEach((f) => this.tone(f, 3.8, 'sine', 0.028));
      this.tone(ch[0] / 2, 3.8, 'triangle', 0.03);
    }
  }
}
