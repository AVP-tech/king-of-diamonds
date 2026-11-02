/* King of Diamonds: particle effects and the animated menu background. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const FX = {
    list: [], cv: null, ctx: null, running: false, dpr: 1,
    init: function () {
      this.cv = document.getElementById('fx');
      try { this.ctx = this.cv.getContext('2d'); } catch (e) { this.ctx = null; }
      this.resize(); const self = this;
      window.addEventListener('resize', function () { self.resize(); });
    },
    resize: function () {
      if (!this.cv) return;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = Math.round(window.innerWidth * this.dpr);
      this.cv.height = Math.round(window.innerHeight * this.dpr);
    },
    add: function (p) {
      if (!this.ctx || this.list.length > 2500) return;
      this.list.push(p);
      if (!this.running) { this.running = true; const self = this; requestAnimationFrame(function () { self.loop(); }); }
    },
    loop: function () {
      const c = this.ctx, d = this.dpr;
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      const keep = [];
      for (let i = 0; i < this.list.length; i++) {
        const p = this.list[i];
        p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.vx *= p.drag || 0.99; p.life -= p.decay; p.rot = (p.rot || 0) + (p.spin || 0);
        if (p.life <= 0) continue;
        c.globalAlpha = Math.max(0, Math.min(1, p.life));
        c.fillStyle = p.col;
        c.save(); c.translate(p.x * d, p.y * d); c.rotate(p.rot || 0);
        const s = p.size * d;
        if (p.shape === 'diamond') { c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.65, 0); c.lineTo(0, s); c.lineTo(-s * 0.65, 0); c.closePath(); c.fill(); }
        else if (p.shape === 'strip') c.fillRect(-s, -s * 0.4, s * 2, s * 0.8);
        else if (p.shape === 'glow') { c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(0, 0, s, 0, 6.283); c.fill(); c.globalCompositeOperation = 'source-over'; }
        else c.fillRect(-s / 2, -s / 2, s, s);
        c.restore();
        keep.push(p);
      }
      c.globalAlpha = 1;
      this.list = keep;
      if (keep.length) { const self = this; requestAnimationFrame(function () { self.loop(); }); }
      else { this.running = false; c.clearRect(0, 0, this.cv.width, this.cv.height); }
    },
    burst: function (x, y, o) {
      o = o || {};
      const n = RM ? Math.min(12, o.n || 30) : (o.n || 30), cols = o.cols || ['#FFC54A', '#FFFFFF'];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (o.speed || 4) * (0.3 + Math.random());
        this.add({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), g: o.g == null ? 0.12 : o.g, drag: 0.97,
                   life: 1, decay: 0.015 + Math.random() * 0.02, size: (o.size || 4) * (0.5 + Math.random()), col: cols[i % cols.length],
                   shape: o.shape || 'diamond', spin: (Math.random() - 0.5) * 0.3 });
      }
    },
    confetti: function (rect, gold) {
      const cols = gold ? ['#FFC54A', '#FFE08A', '#E8344E', '#FFFFFF', '#3FD1C6'] : ['#E8344E', '#7A1010', '#FFFFFF'];
      const n = RM ? 40 : 200;
      for (let i = 0; i < n; i++) {
        this.add({ x: rect.left + rect.width * (0.15 + Math.random() * 0.7), y: rect.top + rect.height * 0.3, vx: (Math.random() - 0.5) * 10, vy: -3 - Math.random() * 7,
                   g: 0.16, drag: 0.99, life: 1.7, decay: 0.006 + Math.random() * 0.006, size: 3 + Math.random() * 4,
                   col: cols[i % cols.length], shape: i % 3 ? 'strip' : 'diamond', spin: (Math.random() - 0.5) * 0.3 });
      }
    }
  };

  /* drifting diamond suits behind the menus */
  const BG = {
    cv: null, ctx: null, items: [], on: false, raf: 0, w: 0, h: 0,
    init: function () {
      this.cv = document.getElementById('bg');
      try { this.ctx = this.cv.getContext('2d'); } catch (e) { this.ctx = null; }
      const self = this;
      this.resize();
      window.addEventListener('resize', function () { self.resize(); });
      for (let i = 0; i < 34; i++) this.items.push(this.spawn(true));
    },
    resize: function () {
      if (!this.cv) return;
      const d = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.cv.width = Math.round(this.w * d); this.cv.height = Math.round(this.h * d);
      if (this.ctx) this.ctx.setTransform(d, 0, 0, d, 0, 0);
    },
    spawn: function (anywhere) {
      const z = 0.3 + Math.random() * 0.7;
      return { x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : this.h + 40, z: z, s: 6 + z * 22, vy: 0.15 + z * 0.5,
               rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.01, hue: Math.random() < 0.18 ? 'gold' : 'red', ph: Math.random() * 6.28 };
    },
    start: function () { if (this.on || !this.ctx) return; this.on = true; const self = this; const f = function () { if (!self.on) return; self.draw(); self.raf = requestAnimationFrame(f); }; f(); },
    stop: function () { this.on = false; cancelAnimationFrame(this.raf); if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h); },
    draw: function () {
      const c = this.ctx, t = performance.now() / 1000;
      c.clearRect(0, 0, this.w, this.h);
      for (let i = 0; i < this.items.length; i++) {
        const p = this.items[i];
        if (!RM) { p.y -= p.vy; p.rot += p.vr; }
        if (p.y < -60) this.items[i] = this.spawn(false);
        const tw = 0.5 + 0.5 * Math.sin(t * 1.4 + p.ph);
        c.save(); c.translate(p.x + Math.sin(t * 0.4 + p.ph) * 14 * p.z, p.y); c.rotate(p.rot);
        c.globalAlpha = (0.06 + 0.16 * p.z) * (0.6 + 0.4 * tw);
        c.fillStyle = p.hue === 'gold' ? '#FFC54A' : '#E8344E';
        c.beginPath(); c.moveTo(0, -p.s); c.lineTo(p.s * 0.65, 0); c.lineTo(0, p.s); c.lineTo(-p.s * 0.65, 0); c.closePath(); c.fill();
        c.restore();
      }
    }
  };

  K.FX = FX; K.BG = BG; K.RM = RM;
})();
