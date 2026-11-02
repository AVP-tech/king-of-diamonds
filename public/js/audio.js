/* King of Diamonds: synthesized sound effects, generative music and the voice host. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const S = function () { return K.settings || { sfx: true, music: true, voice: true }; };

  const Sfx = {
    ctx: null, master: null, sfxBus: null, musicBus: null,
    ensure: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} } return this.ctx; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = S().sfx ? 0.6 : 0; this.sfxBus.connect(this.master);
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = S().music ? 0.5 : 0; this.musicBus.connect(this.master);
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    sync: function () {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.sfxBus.gain.setTargetAtTime(S().sfx ? 0.6 : 0, t, 0.05);
      this.musicBus.gain.setTargetAtTime(S().music ? 0.5 : 0, t, 0.2);
    },
    tone: function (f, d, o, bus) {
      const c = this.ctx; if (!c) return;
      o = o || {};
      const t0 = c.currentTime + (o.at || 0);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(f, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + d);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.v || 0.2, t0 + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      osc.connect(g); g.connect(bus || this.sfxBus);
      osc.start(t0); osc.stop(t0 + d + 0.05);
    },
    noise: function (d, o, bus) {
      const c = this.ctx; if (!c) return;
      o = o || {};
      const t0 = c.currentTime + (o.at || 0);
      const len = Math.max(1, Math.floor(c.sampleRate * d));
      const buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q || 0.8;
      bp.frequency.setValueAtTime(o.f || 1200, t0);
      if (o.to) bp.frequency.exponentialRampToValueAtTime(o.to, t0 + d);
      const g = c.createGain();
      g.gain.setValueAtTime(o.v || 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      src.connect(bp); bp.connect(g); g.connect(bus || this.sfxBus);
      src.start(t0); src.stop(t0 + d);
    },
    play: function (n) {
      if (!this.ctx) return;
      const s = this;
      switch (n) {
        case 'hover': s.tone(1800, 0.04, { v: 0.025 }); break;
        case 'click': s.tone(900, 0.05, { type: 'triangle', v: 0.08 }); s.tone(1350, 0.06, { type: 'triangle', v: 0.05, at: 0.03 }); break;
        case 'wipe': s.noise(0.45, { f: 300, to: 4000, v: 0.12 }); break;
        case 'key': s.tone(760, 0.05, { type: 'square', v: 0.04 }); break;
        case 'back': s.tone(380, 0.06, { type: 'square', v: 0.04 }); break;
        case 'lock': s.tone(520, 0.1, { type: 'triangle', v: 0.16 }); s.tone(1040, 0.2, { type: 'triangle', v: 0.12, at: 0.08 }); break;
        case 'botlock': s.tone(1500, 0.05, { v: 0.05 }); s.tone(1900, 0.05, { v: 0.04, at: 0.05 }); break;
        case 'tick': s.tone(1250, 0.05, { type: 'square', v: 0.05 }); break;
        case 'hb': s.tone(70, 0.16, { v: 0.5, to: 45 }); s.tone(64, 0.16, { v: 0.4, to: 42, at: 0.22 }); break;
        case 'spot': s.noise(0.08, { f: 300, v: 0.3 }); s.tone(90, 0.3, { v: 0.25, to: 50 }); break;
        case 'slam': s.tone(55, 1.2, { v: 0.7, to: 30 }); s.noise(0.7, { f: 180, v: 0.4 }); s.tone(220, 1.4, { type: 'sawtooth', v: 0.06 }); break;
        case 'banner': s.noise(0.5, { f: 600, to: 5000, v: 0.12 }); s.tone(110, 0.6, { type: 'sawtooth', v: 0.06 }); break;
        case 'sting': [220, 262, 330].forEach(function (f, i) { s.tone(f, 1.3, { type: 'sawtooth', v: 0.035, at: i * 0.04 }); }); s.noise(0.6, { f: 400, to: 3000, v: 0.08 }); break;
        case 'flip': s.noise(0.12, { f: 3000, v: 0.08 }); break;
        case 'chip': s.tone(300, 0.2, { type: 'triangle', v: 0.16, to: 140 }); break;
        case 'avg': s.tone(440, 0.3, { v: 0.12 }); s.tone(660, 0.3, { v: 0.06, at: 0.05 }); break;
        case 'target': s.tone(880, 0.6, { v: 0.1, to: 520 }); break;
        case 'void': s.tone(200, 0.25, { type: 'square', v: 0.06 }); s.tone(150, 0.3, { type: 'square', v: 0.06, at: 0.15 }); break;
        case 'win': [523, 659, 784, 1046].forEach(function (f, i) { s.tone(f, 0.25, { type: 'triangle', v: 0.13, at: i * 0.09 }); }); break;
        case 'shine': s.tone(1568, 0.5, { v: 0.06 }); s.tone(2093, 0.5, { v: 0.04, at: 0.08 }); break;
        case 'hurt': s.tone(190, 0.35, { type: 'sawtooth', v: 0.12, to: 70 }); s.noise(0.15, { f: 2500, v: 0.08 }); break;
        case 'alarm': for (let i = 0; i < 3; i++) { s.tone(880, 0.14, { type: 'square', v: 0.07, at: i * 0.3 }); s.tone(660, 0.14, { type: 'square', v: 0.07, at: i * 0.3 + 0.15 }); } break;
        case 'servo': s.tone(180, 0.6, { type: 'sawtooth', v: 0.05, to: 420 }); s.noise(0.6, { f: 900, v: 0.05 }); s.tone(1200, 0.05, { type: 'square', v: 0.06, at: 0.62 }); break;
        case 'laser': s.tone(2400, 1.0, { v: 0.04, attack: 0.05 }); s.tone(1200, 0.08, { type: 'square', v: 0.04, at: 0.3 }); s.tone(1200, 0.08, { type: 'square', v: 0.04, at: 0.7 }); break;
        case 'shot':
          s.noise(0.09, { f: 3000, q: 0.4, v: 0.9 });
          s.noise(0.5, { f: 600, to: 120, q: 0.5, v: 0.6, at: 0.02 });
          s.tone(110, 0.5, { v: 0.8, to: 32, attack: 0.002 });
          s.noise(1.2, { f: 1800, to: 400, q: 0.3, v: 0.08, at: 0.15 });
          break;
        case 'zap': s.noise(1.3, { f: 700, to: 5000, v: 0.22 }); s.tone(1400, 1.2, { type: 'sawtooth', v: 0.08, to: 60 }); break;
        case 'boom': s.tone(70, 1.1, { v: 0.6, to: 28 }); s.noise(0.5, { f: 200, v: 0.3 }); break;
        case 'rule': s.tone(110, 2.4, { type: 'sawtooth', v: 0.06 }); s.tone(165, 2.4, { type: 'sawtooth', v: 0.05 }); s.tone(1320, 0.8, { v: 0.05, at: 0.4 }); s.tone(1760, 0.8, { v: 0.04, at: 0.6 }); break;
        case 'clear': [523, 659, 784, 1046, 1318, 1568].forEach(function (f, i) { s.tone(f, 0.5, { type: 'triangle', v: 0.12, at: i * 0.1 }); }); break;
        case 'over': s.tone(220, 1.6, { type: 'sawtooth', v: 0.1, to: 55 }); s.tone(70, 1.6, { v: 0.3, to: 35 }); break;
      }
    }
  };

  /* music: a small drum-and-bass sequencer. Menu: upbeat noir swing. Table: low, tense pulse. */
  const mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  const hash = function (n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  const Music = {
    mode: null, timer: null, step: 0, nextTime: 0, bus: null, duckG: null, intensity: 0, noiseBuf: null,
    ensureBus: function () {
      if (this.bus || !Sfx.ctx) return !!this.bus;
      const c = Sfx.ctx;
      this.duckG = c.createGain(); this.duckG.gain.value = 1; this.duckG.connect(Sfx.musicBus);
      this.bus = c.createGain(); this.bus.gain.value = 0.0001; this.bus.connect(this.duckG);
      const len = Math.floor(c.sampleRate * 1.6), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      const rev = c.createConvolver(); rev.buffer = ir;
      const send = c.createGain(); send.gain.value = 0.22;
      this.bus.connect(send); send.connect(rev); rev.connect(this.duckG);
      const nl = c.sampleRate, nb = c.createBuffer(1, nl, c.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
      return true;
    },
    set: function (mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      if (!Sfx.ctx || !this.ensureBus()) return;
      const c = Sfx.ctx, self = this;
      const target = mode === 'menu' ? 0.85 : mode === 'game' ? 0.32 : 0.0001;
      this.bus.gain.cancelScheduledValues(c.currentTime);
      this.bus.gain.setTargetAtTime(target, c.currentTime, mode ? 0.5 : 0.25);
      if (!mode) return;
      this.step = 0; this.intensity = 0;
      this.nextTime = c.currentTime + 0.12;
      if (!this.timer) this.timer = setInterval(function () { self.schedule(); }, 25);
    },
    stop: function () { this.set(null); },
    duck: function (on) { if (this.duckG && Sfx.ctx) this.duckG.gain.setTargetAtTime(on ? 0.3 : 1, Sfx.ctx.currentTime, 0.12); },
    setIntensity: function (v) { this.intensity = v; },
    schedule: function () {
      const c = Sfx.ctx;
      if (!c || !this.mode) return;
      const bpm = this.mode === 'menu' ? 104 : 88, q = 60 / bpm / 4;
      if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
      while (this.nextTime < c.currentTime + 0.15) {
        this.playStep(this.step, this.nextTime, q);
        const swing = this.mode === 'menu' ? (this.step % 2 === 0 ? 1.2 : 0.8) : 1;
        this.nextTime += q * swing;
        this.step++;
      }
    },
    env: function (node, t, a, peak, d) {
      node.gain.setValueAtTime(0.0001, t);
      node.gain.exponentialRampToValueAtTime(peak, t + a);
      node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    },
    osc: function (type, f, t, dur, peak, o) {
      const c = Sfx.ctx; o = o || {};
      const os = c.createOscillator(), g = c.createGain();
      os.type = type; os.frequency.setValueAtTime(f, t);
      if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
      if (o.detune) os.detune.value = o.detune;
      let out = os;
      if (o.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; f2.Q.value = o.q || 0.7; os.connect(f2); out = f2; }
      out.connect(g); g.connect(this.bus);
      this.env(g, t, o.a || 0.005, peak, dur);
      os.start(t); os.stop(t + dur + 0.1);
    },
    noise: function (t, dur, peak, type, f, q) {
      const c = Sfx.ctx, src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.8;
      src.connect(fl); fl.connect(g); g.connect(this.bus);
      this.env(g, t, 0.002, peak, dur);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    },
    kick: function (t, v) { this.osc('sine', 130, t, 0.32, v, { to: 42, glide: 0.18 }); },
    snare: function (t, v) { this.noise(t, 0.16, v * 0.55, 'bandpass', 1900, 0.9); this.osc('triangle', 190, t, 0.09, v * 0.3); },
    hat: function (t, v, open) { this.noise(t, open ? 0.18 : 0.04, v, 'highpass', 7500, 0.7); },
    playStep: function (step, t, q) {
      const s = step % 16, bar = Math.floor(step / 16);
      if (this.mode === 'menu') {
        const prog = [[45, [57, 60, 64, 67]], [45, [57, 60, 64, 67]], [50, [62, 65, 69, 72]], [50, [62, 65, 69, 72]], [53, [65, 69, 72, 76]], [52, [64, 68, 71, 74]], [45, [57, 60, 64, 67]], [52, [64, 68, 71, 74]]];
        const cur = prog[bar % 8], root = cur[0], ch = cur[1], next = prog[(bar + 1) % 8][0];
        if (s === 0 || s === 8) this.kick(t, 0.7);
        if (s === 10 && bar % 2) this.kick(t, 0.35);
        if (s === 4 || s === 12) this.snare(t, 0.32);
        if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.12 : 0.06, s === 14);
        if (s % 4 === 0) {
          const third = ch[1] - ch[0] === 3 ? 3 : 4;
          const walk = [root, root + third, root + 7, next + (next > root ? -1 : 1)];
          this.osc('triangle', mtof(walk[s / 4] - 12), t, q * 3.4, 0.32, { lp: 600 });
        }
        if (s === 6 || s === 14) ch.forEach(function (m, i) { Music.osc('square', mtof(m), t, q * 1.3, 0.035, { lp: 1600, detune: (i - 1.5) * 4 }); });
        if (bar % 2 === 1 && s >= 8 && s % 2 === 0 && hash(bar * 16 + s) < 0.75) {
          const scale = [69, 72, 74, 76, 79, 81, 84];
          this.osc('sine', mtof(scale[Math.floor(hash(bar * 7 + s * 3) * scale.length)]), t, q * 2.2, 0.08, { a: 0.01 });
          this.osc('sine', mtof(scale[Math.floor(hash(bar * 7 + s * 3) * scale.length)] + 12), t, q * 1.2, 0.015);
        }
        if (s === 0 && bar % 4 === 0) ch.forEach(function (m) { Music.osc('sawtooth', mtof(m - 12), t, q * 60, 0.012, { lp: 900, a: 0.6 }); });
      } else if (this.mode === 'game') {
        const hot = this.intensity > 0;
        if (s === 0 || s === 10) this.kick(t, s === 0 ? 0.75 : 0.45);
        if (s === 7 && bar % 2) this.kick(t, 0.35);
        if (s % 2 === 0) this.osc('sawtooth', mtof(28 + (bar % 4 === 3 && s >= 8 ? 1 : 0)), t, q * 1.5, 0.22, { lp: 180 + (hot ? 160 : 0), q: 4 });
        if (hot || s % 2 === 0) this.hat(t, hot ? 0.07 : (s % 4 === 0 ? 0.05 : 0.025), false);
        if (s === 4 || s === 12) this.osc('sine', 1350, t, 0.05, 0.05);
        if (s === 12 && bar % 2) this.snare(t, 0.18);
        if (s === 0 && bar % 4 === 0) [40, 43, 46, 53].forEach(function (m) { Music.osc('sawtooth', mtof(m), t, q * 62, 0.014, { lp: 700, a: 1.2 }); });
        if (hot && s % 2 === 0) this.osc('sawtooth', mtof(76 + (s % 4 ? 1 : 0)), t, q * 1.8, 0.02, { lp: 2400 });
      }
    }
  };

  /* voice host using the browser's speech voices */
  const Voice = {
    ok: ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window),
    voices: [], cur: null,
    init: function () {
      if (!this.ok) return;
      const self = this;
      const load = function () { try { self.voices = window.speechSynthesis.getVoices() || []; } catch (e) {} };
      load();
      try { window.speechSynthesis.addEventListener('voiceschanged', load); } catch (e) { window.speechSynthesis.onvoiceschanged = load; }
    },
    voiceFor: function (lang) {
      const L = function (v) { return (v.lang || '').toLowerCase().replace('_', '-'); };
      const vs = this.voices;
      if (lang === 'hi') return vs.filter(function (v) { return L(v).indexOf('hi') === 0; })[0] || null;
      const en = vs.filter(function (v) { return L(v).indexOf('en') === 0; });
      const male = en.filter(function (v) { return /male|daniel|rishi|arthur|fred|guy|ravi|google uk english male/i.test(v.name) && !/female/i.test(v.name); })[0];
      return male || en.filter(function (v) { return L(v) === 'en-gb'; })[0] || en.filter(function (v) { return L(v) === 'en-in'; })[0] || en[0] || null;
    },
    available: function (lang) {
      if (!this.ok) return false;
      if (!this.voices.length) return true;
      return !!this.voiceFor(lang);
    },
    speak: function (text, lang) {
      const self = this;
      return new Promise(function (res) {
        self.stop();
        if (!self.ok) { res(false); return; }
        const v = self.voiceFor(lang);
        const parts = (text.match(/[^.!?।]+[.!?।]*/g) || [text]).map(function (s) { return s.trim(); }).filter(Boolean);
        let i = 0, done = false;
        const me = {};
        const finish = function () { if (done) return; done = true; clearTimeout(guard); if (self.cur === me) self.cur = null; res(true); };
        me.finish = finish;
        const guard = setTimeout(finish, text.length * 110 + 5000);
        self.cur = me;
        const next = function () {
          if (done) return;
          if (i >= parts.length) { finish(); return; }
          const u = new window.SpeechSynthesisUtterance(parts[i++]);
          if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'hi' ? 'hi-IN' : 'en-GB';
          u.rate = lang === 'hi' ? 0.95 : 0.96; u.pitch = 0.72;
          u.onend = next; u.onerror = next;
          try { window.speechSynthesis.speak(u); } catch (e) { finish(); }
        };
        next();
      });
    },
    stop: function () {
      if (!this.ok) return;
      const c = this.cur; this.cur = null;
      if (c) c.finish();
      try { window.speechSynthesis.cancel(); } catch (e) {}
    },
    note: function () {
      if (!this.ok) return K.t('noVoice');
      if (this.voices.length && !this.voiceFor(K.lang)) return K.lang === 'hi' ? K.t('noHindi') : K.t('noVoice');
      return '';
    }
  };

  K.Sfx = Sfx; K.Music = Music; K.Voice = Voice;
})();
