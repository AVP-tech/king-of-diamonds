/* King of Diamonds: the 3D card room (Three.js).
   A wooden round table under a hanging lamp, players seated all around it, you in first person.
   Same API as before: build, expr, gaze, flip, placard, execute... so the game flow is unchanged. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const T = window.THREE;
  const $ = function (s) { return document.querySelector(s); };
  const speed = function () { return K.FAST ? 0.02 : 1; };
  const wait = function (ms) { return new Promise(function (r) { setTimeout(r, Math.max(10, ms * speed())); }); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  const R_TABLE = 1.45, H_TABLE = 0.78, D_SEAT = 1.95;
  const GAZE = { center: [0, 0], up: [0, -2.4], left: [-3, 0], right: [3, 0], down: [0, 2] };

  /* ---------- procedural textures ---------- */
  function canvasTex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function woodPlanks(x, w, h, base, dark, planks) {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const pw = h / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * pw;
      x.fillStyle = 'rgba(0,0,0,' + rnd(0.02, 0.12) + ')'; x.fillRect(0, y, w, pw);
      for (let g = 0; g < 26; g++) {
        x.strokeStyle = 'rgba(' + (g % 2 ? '40,18,8' : '255,220,170') + ',' + rnd(0.03, 0.09) + ')';
        x.lineWidth = rnd(0.6, 2.2);
        x.beginPath();
        const gy = y + rnd(0, pw);
        x.moveTo(0, gy);
        for (let s = 0; s <= w; s += w / 8) x.lineTo(s, gy + Math.sin(s / rnd(30, 80) + g) * rnd(1, 4));
        x.stroke();
      }
      x.fillStyle = dark; x.fillRect(0, y, w, 2);
      const cut = rnd(0.2, 0.8) * w; x.fillRect(cut, y, 2, pw);
    }
  }
  const TEX = {};
  function textures() {
    if (TEX.wood) return TEX;
    TEX.wood = canvasTex(1024, 1024, function (x, w, h) { woodPlanks(x, w, h, '#6B3A1F', 'rgba(25,10,4,.7)', 9); }, [1, 1]);
    TEX.floor = canvasTex(1024, 1024, function (x, w, h) { woodPlanks(x, w, h, '#3A2216', 'rgba(10,4,2,.8)', 12); }, [5, 5]);
    TEX.wall = canvasTex(512, 512, function (x, w, h) {
      x.fillStyle = '#4A1414'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,190,120,.06)';
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        const cx = i * 64 + (j % 2 ? 32 : 0), cy = j * 64;
        x.beginPath(); x.moveTo(cx, cy - 18); x.lineTo(cx + 12, cy); x.lineTo(cx, cy + 18); x.lineTo(cx - 12, cy); x.closePath(); x.fill();
      }
      x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 8; i++) x.fillRect(i * 64, 0, 2, h);
    }, [16, 2]);
    TEX.felt = canvasTex(1024, 1024, function (x, w, h) {
      const cx = w / 2, cy = h / 2, R = w / 2;
      const g = x.createRadialGradient(cx, cy, 40, cx, cy, R);
      g.addColorStop(0, '#5E1A1A'); g.addColorStop(0.7, '#481212'); g.addColorStop(1, '#2E0B0B');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
      for (let i = 0; i < 4000; i++) { x.fillStyle = 'rgba(255,255,255,' + rnd(0, 0.025) + ')'; x.fillRect(rnd(0, w), rnd(0, h), 1.5, 1.5); }
      x.strokeStyle = 'rgba(255,205,120,.75)'; x.lineWidth = 5;
      x.beginPath(); x.arc(cx, cy, R * 0.93, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R * 0.74, 0, Math.PI * 2); x.stroke();
      x.fillStyle = 'rgba(255,205,120,.85)'; x.font = '700 38px Martian Mono, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let v = 0; v < 100; v += 2) {
        const a = Math.PI / 2 + v / 100 * Math.PI * 2, big = v % 10 === 0;
        const r1 = R * 0.92, r2 = R * (big ? 0.84 : 0.88);
        x.strokeStyle = 'rgba(255,205,120,' + (big ? 0.9 : 0.5) + ')'; x.lineWidth = big ? 4 : 2;
        x.beginPath(); x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); x.stroke();
        if (big) { x.save(); x.translate(cx + Math.cos(a) * R * 0.79, cy + Math.sin(a) * R * 0.79); x.rotate(a + Math.PI / 2); x.fillText(String(v), 0, 0); x.restore(); }
      }
      x.save(); x.translate(cx, cy);
      x.fillStyle = 'rgba(232,52,78,.55)'; x.strokeStyle = 'rgba(255,205,120,.8)'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(0, -150); x.lineTo(100, 0); x.lineTo(0, 150); x.lineTo(-100, 0); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,205,120,.9)'; x.font = '900 120px Cinzel, serif'; x.fillText('K', 0, 8);
      x.restore();
    });
    TEX.leather = canvasTex(256, 256, function (x, w, h) {
      x.fillStyle = '#3B1A12'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { x.fillStyle = 'rgba(0,0,0,' + rnd(0, 0.15) + ')'; x.fillRect(rnd(0, w), rnd(0, h), 2, 2); }
      x.fillStyle = 'rgba(255,200,140,.12)';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(32 + i * 64, 32 + j * 64, 5, 0, 6.3); x.fill(); }
    });
    TEX.splat = canvasTex(256, 256, function (x) {
      x.fillStyle = '#7E0A16';
      x.beginPath(); x.arc(128, 128, 46, 0, 6.3); x.fill();
      for (let i = 0; i < 40; i++) {
        const a = rnd(0, 6.3), d = rnd(40, 118), r = rnd(3, 16);
        x.fillStyle = i % 3 ? '#7E0A16' : '#A3101F';
        x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, Math.max(1, r * (1 - d / 160)), 0, 6.3); x.fill();
      }
      for (let i = 0; i < 12; i++) {
        const a = rnd(0, 6.3); x.strokeStyle = '#7E0A16'; x.lineWidth = rnd(3, 7); x.lineCap = 'round';
        x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * rnd(60, 110), 128 + Math.sin(a) * rnd(60, 110)); x.stroke();
      }
    });
    TEX.glow = canvasTex(128, 128, function (x, w, h) {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,220,150,.8)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    TEX.redGlow = canvasTex(64, 64, function (x) {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,40,60,1)'); g.addColorStop(1, 'rgba(255,0,30,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    return TEX;
  }
  function mat(color, o) {
    o = o || {};
    return new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.7, metalness: 0 }, o));
  }
  function limb(a, b, r, m) {
    const d = new T.Vector3().subVectors(b, a), len = d.length();
    const mesh = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.001, len - r * 0.4), 4, 12), m);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return mesh;
  }
  function cap(r, th0, th1, phi0, phiLen, m) {
    return new T.Mesh(new T.SphereGeometry(r, 32, 16, phi0 == null ? 0 : phi0, phiLen == null ? Math.PI * 2 : phiLen, th0 * Math.PI, (th1 - th0) * Math.PI), m);
  }
  function textSprite(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.userData.canvas = c; s.userData.tex = t;
    return s;
  }

  /* ---------- the torso texture: outfit details on the front ---------- */
  function torsoTexture(a, C) {
    const sh = K.shade;
    return canvasTex(512, 256, function (x, w, h) {
      const o = C.outfit, d = sh(o, 0.7), front = w / 2;
      x.fillStyle = o; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { x.fillStyle = 'rgba(0,0,0,' + rnd(0, 0.06) + ')'; x.fillRect(rnd(0, w), rnd(0, h), 2, 2); }
      const poly = function (pts, col) { x.fillStyle = col; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); };
      if (a.outfit === 'blazer') {
        poly([front - 34, 0, front + 34, 0, front, 120], '#E6ECEE');
        poly([front - 34, 0, front - 60, 0, front - 6, 150, front, 120], d);
        poly([front + 34, 0, front + 60, 0, front + 6, 150, front, 120], d);
        x.fillStyle = C.accent; x.fillRect(front - 90, 70, 22, 10);
        x.fillStyle = '#222'; [160, 195].forEach(function (y) { x.beginPath(); x.arc(front + 12, y, 4, 0, 6.3); x.fill(); });
      } else if (a.outfit === 'hoodie') {
        x.strokeStyle = '#D9D2BE'; x.lineWidth = 5; x.lineCap = 'round';
        x.beginPath(); x.moveTo(front - 14, 6); x.lineTo(front - 16, 80); x.moveTo(front + 14, 6); x.lineTo(front + 16, 80); x.stroke();
        x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(front - 60, 170, 120, 70);
      } else if (a.outfit === 'vest') {
        x.fillStyle = '#EFEBE4'; x.fillRect(0, 0, w, h);
        poly([front - 70, 0, front - 24, 0, front, 110, front + 24, 0, front + 70, 0, front + 70, h, front - 70, h], o);
        x.fillStyle = '#E8B931'; [140, 175, 210].forEach(function (y) { x.beginPath(); x.arc(front, y, 5, 0, 6.3); x.fill(); });
      } else if (a.outfit === 'jacket') {
        x.fillStyle = sh(o, 1.35); x.fillRect(front - 2, 0, 4, h);
        poly([front - 40, 0, front - 6, 0, front - 14, 46], d); poly([front + 40, 0, front + 6, 0, front + 14, 46], d);
      } else {
        x.strokeStyle = d; x.lineWidth = 7; x.beginPath(); x.arc(front, -10, 36, 0.2, Math.PI - 0.2); x.stroke();
        x.fillStyle = C.accent; x.fillRect(front - 60, 110, 40, 8);
      }
    });
  }

  /* ---------- one seated player ---------- */
  function Character(p, index) {
    const a = p.avatar, C = K.avatarColors(a), sh = K.shade;
    const self = this;
    this.p = p; this.id = p.id; this.i = index;
    this.mats = [];
    const M = function (color, o) { const m = mat(color, o); self.mats.push(m); return m; };
    const skin = M(C.skin, { roughness: 0.55 });
    const sleeve = M(a.outfit === 'vest' ? '#E3DED6' : C.outfit, { roughness: 0.85 }), pants = M('#23252E', { roughness: 0.9 }), shoe = M('#121212', { roughness: 0.5 });
    const leather = M('#ffffff', { map: textures().leather, roughness: 0.6 }), wood = M('#5A2E18', { map: textures().wood, roughness: 0.5 });

    const root = this.root = new T.Group();

    // chair
    const seat = new T.Mesh(new T.BoxGeometry(0.56, 0.08, 0.52), leather); seat.position.set(0, 0.46, -0.04);
    const back = new T.Mesh(new T.BoxGeometry(0.56, 0.86, 0.08), leather); back.position.set(0, 0.9, -0.3); back.rotation.x = -0.1;
    const frame = new T.Mesh(new T.BoxGeometry(0.62, 0.06, 0.1), wood); frame.position.set(0, 1.34, -0.35); frame.rotation.x = -0.1;
    root.add(seat, back, frame);
    [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.18], [0.24, 0.18]].forEach(function (q) {
      const l = new T.Mesh(new T.CylinderGeometry(0.025, 0.02, 0.44, 8), wood); l.position.set(q[0], 0.22, q[1]); root.add(l);
    });
    this.chairBack = back;

    // legs
    const hips = new T.Group(); hips.position.set(0, 0.52, -0.04); root.add(hips);
    [-1, 1].forEach(function (s) {
      hips.add(limb(new T.Vector3(0.1 * s, 0, 0.02), new T.Vector3(0.11 * s, -0.01, 0.42), 0.075, pants));
      hips.add(limb(new T.Vector3(0.11 * s, -0.01, 0.42), new T.Vector3(0.12 * s, -0.46, 0.46), 0.06, pants));
      const f = new T.Mesh(new T.BoxGeometry(0.1, 0.06, 0.2), shoe); f.position.set(0.12 * s, -0.49, 0.52); hips.add(f);
    });

    // torso pivot (slumps on death)
    const torsoP = this.torso = new T.Group(); hips.add(torsoP);
    const pts = [[0.15, 0], [0.18, 0.08], [0.2, 0.25], [0.215, 0.42], [0.2, 0.52], [0.12, 0.58], [0.06, 0.6]].map(function (q) { return new T.Vector2(q[0], q[1]); });
    const torso = new T.Mesh(new T.LatheGeometry(pts, 32, Math.PI, Math.PI * 2), M('#ffffff', { map: torsoTexture(a, C), roughness: 0.85 }));
    torso.scale.set(1.15, 1, 0.8); torsoP.add(torso);
    const neck = new T.Mesh(new T.CylinderGeometry(0.052, 0.058, 0.1, 12), M(C.shade, { roughness: 0.6 })); neck.position.set(0, 0.64, 0.005); torsoP.add(neck);
    if (a.outfit === 'hoodie') { const hood = new T.Mesh(new T.TorusGeometry(0.1, 0.045, 10, 24), M(sh(C.outfit, 0.8))); hood.position.set(0, 0.6, -0.05); hood.rotation.x = Math.PI / 2 - 0.3; torsoP.add(hood); }
    if (a.neck === 'bowtie') { const bm = M('#C82A38'); [-1, 1].forEach(function (s) { const c = new T.Mesh(new T.ConeGeometry(0.028, 0.05, 10), bm); c.rotation.z = s * Math.PI / 2; c.position.set(0.025 * s, 0.6, 0.09); torsoP.add(c); }); }
    if (a.neck === 'chain') { const ch = new T.Mesh(new T.TorusGeometry(0.1, 0.006, 6, 32), M('#E8B931', { metalness: 0.9, roughness: 0.25 })); ch.position.set(0, 0.56, 0.06); ch.rotation.x = Math.PI / 2 - 0.55; torsoP.add(ch); }
    if (a.neck === 'headphones') {
      const hm = M('#2A2F3A', { roughness: 0.4 }), am = M(C.accent, { emissive: C.accent, emissiveIntensity: 0.25 });
      const band = new T.Mesh(new T.TorusGeometry(0.1, 0.014, 8, 24, Math.PI), hm); band.position.set(0, 0.6, 0); band.rotation.x = Math.PI / 2; band.rotation.z = Math.PI; torsoP.add(band);
      [-1, 1].forEach(function (s) {
        const cup = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.035, 16), hm); cup.rotation.z = Math.PI / 2; cup.position.set(0.1 * s, 0.6, 0.02); torsoP.add(cup);
        const ring = new T.Mesh(new T.TorusGeometry(0.04, 0.006, 6, 18), am); ring.rotation.y = Math.PI / 2; ring.position.set(0.12 * s, 0.6, 0.02); torsoP.add(ring);
      });
    }
    if (a.hair === 'long') { const lb = new T.Mesh(new T.CylinderGeometry(0.17, 0.2, 0.3, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), M(C.hair, { side: T.DoubleSide })); lb.position.set(0, 0.6, -0.03); torsoP.add(lb); }

    // arms resting on the table, hands around the tablet
    const sY = 0.5, handY = H_TABLE - 0.52 + 0.05, handZ = D_SEAT - R_TABLE + 0.14;
    this.handY = handY;
    [-1, 1].forEach(function (s) {
      const sho = new T.Vector3(0.235 * s, sY, 0), elb = new T.Vector3(0.29 * s, handY + 0.03, 0.22), hand = new T.Vector3(0.13 * s, handY, handZ);
      torsoP.add(limb(sho, elb, 0.058, sleeve));
      torsoP.add(limb(elb, hand, 0.05, sleeve));
      const h = new T.Mesh(new T.SphereGeometry(0.05, 14, 10), skin); h.scale.set(0.9, 0.65, 1.25); h.position.copy(hand).add(new T.Vector3(-0.01 * s, 0.01, 0.03)); torsoP.add(h);
    });

    // tablet (screen faces the player; flips to show the number)
    const tab = this.tablet = new T.Group(); tab.position.set(0, handY + 0.1, handZ + 0.04); tab.rotation.x = -0.25; torsoP.add(tab);
    const tabInner = this.tabInner = new T.Group(); tab.add(tabInner);
    tabInner.add(new T.Mesh(new T.BoxGeometry(0.26, 0.18, 0.016), M('#14161D', { roughness: 0.35, metalness: 0.4 })));
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 180;
    this.screenCanvas = sc; this.screenTex = new T.CanvasTexture(sc); this.screenTex.colorSpace = T.SRGBColorSpace;
    const screen = new T.Mesh(new T.PlaneGeometry(0.235, 0.155), new T.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
    screen.position.z = -0.0085; screen.rotation.y = Math.PI; tabInner.add(screen);
    const logo = new T.Mesh(new T.CircleGeometry(0.025, 4), M('#5A1622', { roughness: 0.4 })); logo.position.z = 0.0085; logo.rotation.z = Math.PI / 4; tabInner.add(logo);
    this.led = new T.Mesh(new T.SphereGeometry(0.009, 8, 6), new T.MeshBasicMaterial({ color: 0x333a4a, toneMapped: false })); this.led.position.set(0.105, 0.065, 0.01); tabInner.add(this.led);
    this.drawScreen('');

    // head
    const headP = this.headP = new T.Group(); headP.position.set(0, 0.68, 0.01); torsoP.add(headP);
    const f = { oval: [1, 1.1, 1], round: [1.08, 1.04, 1.02], long: [0.95, 1.18, 1] }[a.face] || [1, 1.1, 1];
    const skull = this.skull = new T.Group(); skull.position.set(0, 0.155, 0); skull.scale.set(f[0], f[1], f[2]); headP.add(skull);
    const r = 0.15;
    this.headMesh = new T.Mesh(new T.SphereGeometry(r, 32, 24), M(C.skin, { roughness: 0.55 })); skull.add(this.headMesh);
    [-1, 1].forEach(function (s) { const e = new T.Mesh(new T.SphereGeometry(0.032, 10, 8), M(C.shade)); e.scale.set(0.6, 1, 0.8); e.position.set(0.148 * s, -0.005, -0.005); skull.add(e); });
    const nose = new T.Mesh(new T.SphereGeometry(0.024, 12, 8), skin); nose.scale.set(0.8, 1, 1); nose.position.set(0, -0.02, r * 0.98); skull.add(nose);
    const fc = document.createElement('canvas'); fc.width = 256; fc.height = 256;
    this.faceCanvas = fc; this.faceTex = new T.CanvasTexture(fc); this.faceTex.colorSpace = T.SRGBColorSpace;
    const face = new T.Mesh(new T.SphereGeometry(r * 1.004, 40, 30, Math.PI / 6, Math.PI * 2 / 3, Math.PI * 0.24, Math.PI * 0.56),
      new T.MeshStandardMaterial({ map: this.faceTex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    skull.add(face);
    this.face = { expr: 'neutral', gaze: [0, 0], blink: false, dead: false, blood: false };
    this.drawFace();
    this.buildHair(a, C, skull, r, M);

    // crown (Crown rule)
    const crown = this.crown = new T.Group();
    const cm = M('#FFC54A', { metalness: 0.9, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.6 });
    crown.add(new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.05, 20, 1, true), cm));
    for (let i = 0; i < 5; i++) { const sp = new T.Mesh(new T.ConeGeometry(0.018, 0.06, 6), cm); const ang = i / 5 * Math.PI * 2; sp.position.set(Math.cos(ang) * 0.075, 0.05, Math.sin(ang) * 0.075); crown.add(sp); }
    crown.position.set(0, 0.36, 0); crown.visible = false; headP.add(crown);

    root.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.phase = Math.random() * 6;
  }
  Character.prototype.buildHair = function (a, C, skull, r, M) {
    const PI = Math.PI, back0 = PI * 5 / 6, backL = PI * 4 / 3;
    const hm = M(C.hair, { roughness: 0.6 });
    const add = function (m) { skull.add(m); return m; };
    switch (a.hair) {
      case 'bob': add(cap(r * 1.07, 0, 0.4, null, null, hm)); add(cap(r * 1.1, 0.3, 0.8, back0 - 0.3, backL + 0.6, hm)); break;
      case 'short': add(cap(r * 1.05, 0, 0.36, null, null, hm)); add(cap(r * 1.045, 0.3, 0.6, back0, backL, hm)); break;
      case 'slick': { const c = add(cap(r * 1.045, 0, 0.38, null, null, hm)); c.scale.y = 0.97; add(cap(r * 1.04, 0.3, 0.56, back0, backL, hm)); break; }
      case 'pulled': {
        add(cap(r * 1.04, 0, 0.37, null, null, hm)); add(cap(r * 1.04, 0.3, 0.6, back0, backL, hm));
        for (let i = 0; i < 7; i++) { const b = new T.Mesh(new T.SphereGeometry(0.034, 10, 8), hm); b.position.set(0.04 + i * 0.012, -0.12 - i * 0.055, -0.09 + i * 0.022); skull.add(b); }
        break;
      }
      case 'long': add(cap(r * 1.07, 0, 0.42, null, null, hm)); add(cap(r * 1.1, 0.3, 0.92, back0 - 0.2, backL + 0.4, hm)); break;
      case 'curly': {
        add(cap(r * 1.05, 0, 0.42, null, null, hm));
        for (let i = 0; i < 34; i++) {
          const th = rnd(0.05, 0.44) * PI, ph = rnd(0, 2 * PI);
          if (th > 0.32 * PI && Math.sin(ph) > 0.5) continue;
          const b = new T.Mesh(new T.SphereGeometry(0.042, 10, 8), hm);
          b.position.set(-Math.cos(ph) * Math.sin(th) * r * 1.08, Math.cos(th) * r * 1.08, Math.sin(ph) * Math.sin(th) * r * 1.08); skull.add(b);
        }
        break;
      }
      case 'buzz': add(cap(r * 1.012, 0, 0.4, null, null, M(new T.Color(C.hair).lerp(new T.Color(C.skin), 0.45)))); break;
      case 'mohawk': {
        add(cap(r * 1.01, 0, 0.4, null, null, M(new T.Color(C.hair).lerp(new T.Color(C.skin), 0.7))));
        for (let i = 0; i < 7; i++) {
          const th = (-0.32 + i * 0.1) * PI;
          const sp = new T.Mesh(new T.ConeGeometry(0.025, 0.09, 6), hm);
          sp.position.set(0, Math.cos(th) * r * 1.08, Math.sin(th) * r * 1.08);
          sp.rotation.x = th;
          skull.add(sp);
        }
        break;
      }
      default: break;
    }
    if (a.head === 'beanie') {
      const bm = M(K.shade(C.accent, 0.75), { roughness: 0.95 });
      add(cap(r * 1.13, 0, 0.45, null, null, bm));
      const band = new T.Mesh(new T.TorusGeometry(r * 1.13 * Math.sin(0.45 * PI), 0.022, 10, 32), M(K.shade(C.accent, 0.55), { roughness: 0.95 }));
      band.rotation.x = PI / 2; band.position.y = r * 1.13 * Math.cos(0.45 * PI); skull.add(band);
      const pom = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), bm); pom.position.y = r * 1.16; skull.add(pom);
    } else if (a.head === 'cap') {
      const cm = M(K.shade(C.outfit, 1.2), { roughness: 0.8, side: T.DoubleSide });
      add(cap(r * 1.09, 0, 0.4, null, null, cm));
      const brim = new T.Mesh(new T.CircleGeometry(0.11, 24, 0, PI), cm);
      brim.rotation.x = -PI / 2 + 0.15; brim.position.set(0, r * 1.09 * Math.cos(0.4 * PI) + 0.005, r * 0.85); skull.add(brim);
    } else if (a.head === 'band') {
      const b = new T.Mesh(new T.TorusGeometry(r * 1.02 * Math.sin(0.33 * PI), 0.016, 8, 32), M(C.accent, { roughness: 0.8 }));
      b.rotation.x = PI / 2; b.position.y = r * Math.cos(0.33 * PI); skull.add(b);
    }
  };
  Character.prototype.drawFace = function () {
    const self = this;
    if (this._drawing) { this._again = true; return; }
    this._drawing = true;
    const img = new Image();
    img.onload = function () {
      const x = self.faceCanvas.getContext('2d');
      x.clearRect(0, 0, 256, 256); x.drawImage(img, 0, 0, 256, 256);
      self.faceTex.needsUpdate = true;
      self._drawing = false;
      if (self._again) { self._again = false; self.drawFace(); }
    };
    img.onerror = function () { self._drawing = false; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(K.avatarFaceSVG(this.p.avatar, this.face));
  };
  Character.prototype.setFace = function (patch) { Object.assign(this.face, patch); this.drawFace(); };
  Character.prototype.drawScreen = function (num) {
    const x = this.screenCanvas.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, '#0B1420'); g.addColorStop(1, '#05080E');
    x.fillStyle = g; x.fillRect(0, 0, 256, 180);
    x.strokeStyle = K.accentOf(this.p.avatar); x.lineWidth = 8; x.strokeRect(4, 4, 248, 172);
    x.fillStyle = '#fff'; x.font = '800 104px Martian Mono, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(num), 128, 96);
    this.screenTex.needsUpdate = true;
  };
  Character.prototype.setLed = function (state) {
    this.led.material.color.set(state === 'think' ? 0xFFB020 : state === 'lock' ? 0x3EE08F : 0x333a4a);
  };
  Character.prototype.headWorld = function (out) { return this.skull.getWorldPosition(out || new T.Vector3()); };

  /* ---------- tiny tween helper ---------- */
  const tweens = [];
  // tweens run on a clock that can be slowed down (slow motion in the death cinematic)
  const clock = { v: performance.now(), last: performance.now(), scale: 1 };
  function tickClock(now) { clock.v += Math.max(0, now - clock.last) * clock.scale; clock.last = now; return clock.v; }
  function tween(obj, prop, to, ms, ease, done) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj && tweens[i].prop === prop) tweens.splice(i, 1);
    tickClock(performance.now());
    tweens.push({ obj: obj, prop: prop, from: obj[prop], to: to, t0: clock.v, ms: Math.max(1, ms * speed()), ease: ease || 'out', done: done });
  }
  function runTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (!tw) continue;
      const p = clamp((now - tw.t0) / tw.ms, 0, 1);
      const e = tw.ease === 'in' ? p * p : tw.ease === 'inout' ? (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) : tw.ease === 'back' ? 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2) : 1 - Math.pow(1 - p, 3);
      tw.obj[tw.prop] = tw.from + (tw.to - tw.from) * e;
      if (p >= 1) { const k = tweens.indexOf(tw); if (k >= 0) tweens.splice(k, 1); if (tw.done) tw.done(); }
    }
  }

  /* ---------- the scene ---------- */
  const Scene = {
    seats: [], idx: {}, chars: [], ok: false, running: false,
    init: function () {
      if (this.renderer) return true;
      if (!T) return false;
      try { this.renderer = new T.WebGLRenderer({ canvas: $('#g3d'), antialias: true, powerPreference: 'high-performance' }); }
      catch (e) { this.renderer = null; return false; }
      const R = this.renderer;
      const LOW = !!window.__KOD_SHOT;
      R.setPixelRatio(LOW ? 0.6 : Math.min(window.innerWidth < 700 ? 1.5 : 1.75, window.devicePixelRatio || 1));
      R.shadowMap.enabled = !LOW; R.shadowMap.type = T.PCFSoftShadowMap;
      R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
      this.scene = new T.Scene();
      this.scene.background = new T.Color(0x0d0705);
      this.scene.fog = new T.Fog(0x0d0705, 7, 15);
      this.camera = new T.PerspectiveCamera(50, 1, 0.05, 40);
      this.cam = { pos: new T.Vector3(0, 1.42, 2.35), look: new T.Vector3(0, 0.98, -0.35), roll: 0, drop: 0, tilt: 0, shake: 0, yT: null, zoom: 1, fx: 0, fy: 0, fz: 0, fw: 0,
                   yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, hx: 0, hy: 0 };
      this.buildRoom();
      this.dynamic = new T.Group(); this.scene.add(this.dynamic);
      const self = this;
      window.addEventListener('resize', function () { self.resize(); });
      this.initLook();
      this.resize();
      this.ok = true;
      return true;
    },
    buildRoom: function () {
      const S = this.scene, tx = textures();
      S.add(new T.HemisphereLight(0xffd9b0, 0x200c06, 0.55));
      const main = this.mainLight = new T.SpotLight(0xffc98a, 95, 10, 0.9, 0.55, 2);
      main.position.set(0, 3.4, 0); main.target.position.set(0, H_TABLE, 0);
      main.castShadow = true; main.shadow.mapSize.set(window.innerWidth < 700 ? 1024 : 2048, window.innerWidth < 700 ? 1024 : 2048); main.shadow.bias = -0.0004; main.shadow.camera.near = 0.5; main.shadow.camera.far = 8;
      S.add(main, main.target);
      const fill = new T.PointLight(0xff9a5a, 9, 12, 2); fill.position.set(0, 2.3, 3.6); S.add(fill);
      this.flashLight = new T.PointLight(0xfff0c0, 0, 6, 2); S.add(this.flashLight);
      const acc = this.accent = new T.SpotLight(0xff2a3a, 0, 5, 0.42, 0.6, 2); acc.position.set(0, 3.2, 0); S.add(acc, acc.target);
      this.accentId = null;

      const floor = new T.Mesh(new T.CircleGeometry(9, 48), mat('#ffffff', { map: tx.floor, roughness: 0.75 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; S.add(floor);
      const wall = new T.Mesh(new T.CylinderGeometry(7, 7, 4.6, 48, 1, true), mat('#ffffff', { map: tx.wall, side: T.BackSide, roughness: 0.9 }));
      wall.position.y = 2.3; S.add(wall);
      const wains = new T.Mesh(new T.CylinderGeometry(6.96, 6.96, 1.1, 48, 1, true), mat('#3A1E12', { map: tx.wood, side: T.BackSide, roughness: 0.6 }));
      wains.position.y = 0.55; S.add(wains);
      const ceil = new T.Mesh(new T.CircleGeometry(7, 32), mat('#1A0E0A', { roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 4.6; S.add(ceil);
      for (let i = 0; i < 6; i++) { const b = new T.Mesh(new T.BoxGeometry(14, 0.18, 0.22), mat('#2A1610', { map: tx.wood })); b.position.y = 4.45; b.rotation.y = i * Math.PI / 6; S.add(b); }

      const shade = new T.Mesh(new T.ConeGeometry(0.42, 0.32, 32, 1, true), mat('#1E2A22', { side: T.DoubleSide, roughness: 0.4, metalness: 0.6 }));
      shade.position.set(0, 3.45, 0); S.add(shade);
      const bulb = new T.Mesh(new T.SphereGeometry(0.09, 16, 12), new T.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false })); bulb.position.set(0, 3.33, 0); S.add(bulb);
      const cord = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 1.2, 6), mat('#111')); cord.position.set(0, 4.05, 0); S.add(cord);
      const halo = new T.Sprite(new T.SpriteMaterial({ map: tx.glow, color: 0xffc070, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
      halo.scale.set(1.1, 1.1, 1); halo.position.set(0, 3.3, 0); S.add(halo);

      for (let i = 0; i < 8; i++) {
        const ang = (i + 0.5) / 8 * Math.PI * 2, x = Math.sin(ang) * 6.85, z = Math.cos(ang) * 6.85;
        const sc = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), new T.MeshBasicMaterial({ color: 0xffb36a, toneMapped: false })); sc.position.set(x, 2.3, z); S.add(sc);
        const g = new T.Sprite(new T.SpriteMaterial({ map: tx.glow, color: 0xff9a4a, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false }));
        g.scale.set(1.2, 1.2, 1); g.position.set(x * 0.99, 2.3, z * 0.99); S.add(g);
      }
      const barrelM = mat('#5A3218', { map: tx.wood, roughness: 0.6 }), hoop = mat('#2A2A2A', { metalness: 0.8, roughness: 0.4 });
      [[-4.6, -3.8], [-5.2, -2.9], [4.9, -3.4], [5.4, 2.8], [-5.5, 2.4]].forEach(function (q) {
        const b = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 1.0, 20), barrelM); b.position.set(q[0], 0.5, q[1]); b.castShadow = true; S.add(b);
        [0.2, 0.8].forEach(function (h) { const r = new T.Mesh(new T.TorusGeometry(0.43, 0.02, 6, 24), hoop); r.rotation.x = Math.PI / 2; r.position.set(q[0], h, q[1]); S.add(r); });
      });
      const shelf = new T.Group(); shelf.position.set(0, 0, -6.5);
      const sm = mat('#3A1E12', { map: tx.wood });
      for (let k = 0; k < 3; k++) { const p = new T.Mesh(new T.BoxGeometry(3.2, 0.06, 0.4), sm); p.position.y = 1.2 + k * 0.6; shelf.add(p); }
      const bottleCols = ['#2E5A2A', '#6B2A14', '#C9A04A', '#1E3A5A', '#5A1A2A'];
      for (let k = 0; k < 3; k++) for (let j = 0; j < 9; j++) {
        const b = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.32, 10), mat(bottleCols[(j + k) % 5], { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }));
        b.position.set(-1.4 + j * 0.35, 1.39 + k * 0.6, 0); shelf.add(b);
      }
      S.add(shelf);

      const top = new T.Mesh(new T.CylinderGeometry(R_TABLE, R_TABLE, 0.07, 72), mat('#ffffff', { map: tx.wood, roughness: 0.45 }));
      top.position.y = H_TABLE - 0.035; top.receiveShadow = true; top.castShadow = true; S.add(top);
      const rimT = new T.Mesh(new T.TorusGeometry(R_TABLE, 0.05, 12, 96), mat('#3A1E10', { map: tx.wood, roughness: 0.35 }));
      rimT.rotation.x = Math.PI / 2; rimT.position.y = H_TABLE - 0.01; rimT.castShadow = true; S.add(rimT);
      const felt = new T.Mesh(new T.CircleGeometry(R_TABLE * 0.84, 72), mat('#ffffff', { map: tx.felt, roughness: 0.95 }));
      felt.rotation.x = -Math.PI / 2; felt.position.y = H_TABLE + 0.002; felt.receiveShadow = true; S.add(felt);
      const ped = new T.Mesh(new T.CylinderGeometry(0.2, 0.32, H_TABLE - 0.1, 24), mat('#2E170C', { map: tx.wood })); ped.position.y = (H_TABLE - 0.1) / 2 + 0.05; S.add(ped);
      const base = new T.Mesh(new T.CylinderGeometry(0.68, 0.74, 0.07, 32), mat('#2E170C', { map: tx.wood })); base.position.y = 0.035; S.add(base);

      const dia = this.diamond = new T.Mesh(new T.OctahedronGeometry(0.09, 0), new T.MeshStandardMaterial({ color: 0xE8344E, emissive: 0x8a0a1e, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.92 }));
      dia.scale.set(0.75, 1.2, 0.75); dia.position.set(0, H_TABLE + 0.2, 0); S.add(dia);
      const dg = new T.Sprite(new T.SpriteMaterial({ map: tx.redGlow, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
      dg.scale.set(0.6, 0.6, 1); dg.position.copy(dia.position); S.add(dg);
      const num = this.holoSprite = textSprite(512, 256);
      num.material.blending = T.AdditiveBlending; num.material.depthTest = false;
      num.scale.set(0.95, 0.475, 1); num.position.set(0, H_TABLE + 0.52, 0); num.renderOrder = 5; S.add(num);
    },

    /* ---------- players ---------- */
    build: function (others, me, forAttract) {
      if (!this.init()) return;
      const self = this;
      if (!forAttract) this.attracting = false;   // a real match takes over the table
      this.dynamic.clear();
      this.cineEnd();
      // your own body: hidden while you play in first person, seen from outside when you are eliminated
      this.me = null;
      if (me) {
        const mc = this.me = new Character(me, -1);
        mc.root.position.set(0, 0, D_SEAT); mc.root.rotation.y = Math.PI; mc.root.visible = false;
        this.dynamic.add(mc.root);
      }
      this.chars = []; this.seats = []; this.idx = {};
      const n = others.length;
      others.forEach(function (p, i) {
        const ang = (i + 1) / (n + 1) * Math.PI * 2;
        const x = Math.sin(ang) * D_SEAT, z = Math.cos(ang) * D_SEAT;
        const c = new Character(p, i);
        c.root.position.set(x, 0, z);
        c.root.rotation.y = Math.atan2(-x, -z);
        self.dynamic.add(c.root);
        self.chars.push(c);
        self.seats.push({ id: p.id, i: i, x: x, z: z, ang: ang, p: p });
        self.idx[p.id] = i;
      });
      let hud = '';
      this.chars.forEach(function (c, i) {
        hud += '<div class="plac hide' + (n > 4 ? ' compact' : '') + '" id="pl-' + i + '" style="--c:' + K.accentOf(c.p.avatar) + '"></div>';
        hud += '<div class="bub" id="bu-' + i + '"></div>';
      });
      $('#hud').innerHTML = hud;
      this.holo('♦', '', '');
      this.resetCamera();
    },
    resetCamera: function () {
      if (!this.cam) return; const C = this.cam;
      C.roll = 0; C.drop = 0; C.shake = 0; C.tilt = 0; C.zoom = 1; C.fw = 0;
      C.yaw = C.tYaw = 0; C.pitch = C.tPitch = 0; C.hx = C.hy = 0;
      if (!this.attracting) this.showLookHint();
    },

    /* ---------- free look: drag (mouse or finger) or A/D W/S to turn your head ---------- */
    initLook: function () {
      const self = this, C = this.cam, scr = $('#scr-game');
      if (!scr) return;
      const P_LO = -0.5, P_HI = 0.42;
      // wide screens can turn to the neighbours beside you; tall phone screens sit further back, so less turn
      const clampLook = function () { const Y = lerp(1.35, 0.6, self.lookT || 0); C.tYaw = clamp(C.tYaw, -Y, Y); C.tPitch = clamp(C.tPitch, P_LO, P_HI); };
      const blocked = function (el) { return !!(el && el.closest && el.closest('button, a, input, select, textarea, .monitor, .pad-wrap, .gbar')); };
      let drag = null, lastTap = 0, lastTapX = 0, lastTapY = 0;
      this.keys = {};
      this.recenter = function () { C.tYaw = 0; C.tPitch = 0; };
      this.looked = function () {
        if (self.lookUsed) return; self.lookUsed = true;
        try { localStorage.setItem('kod.looked', '1'); } catch (e) {}
        self.hideLookHint();
      };
      scr.addEventListener('pointerdown', function (e) {
        if (!self.running || blocked(e.target) || (e.button !== undefined && e.button > 0)) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
        try { scr.setPointerCapture(e.pointerId); } catch (err) {}
      });
      scr.addEventListener('pointermove', function (e) {
        if (drag && e.pointerId === drag.id) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          drag.x = e.clientX; drag.y = e.clientY;
          if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) { drag.moved = true; scr.classList.add('looking'); self.looked(); }
          if (drag.moved) {
            const k = (e.pointerType === 'touch' ? 1.1 : 1) * lerp(2.2, 1.4, self.lookT || 0) / Math.max(500, self.w || 800);
            C.tYaw -= dx * k * 1.25; C.tPitch -= dy * k;
            clampLook();
          }
        } else if (e.pointerType === 'mouse' && self.w) {
          // tiny head sway following the mouse, so the room feels alive even without dragging
          C.hx = -(e.clientX / self.w - 0.5) * 0.07; C.hy = -(e.clientY / self.h - 0.5) * 0.04;
        }
      });
      const end = function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        const tap = !drag.moved;
        drag = null; scr.classList.remove('looking');
        try { scr.releasePointerCapture(e.pointerId); } catch (err) {}
        if (!tap || e.type === 'pointercancel') return;
        const now = performance.now();
        if (now - lastTap < 320 && Math.abs(e.clientX - lastTapX) + Math.abs(e.clientY - lastTapY) < 40) { self.recenter(); lastTap = 0; }
        else { lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY; }
      };
      scr.addEventListener('pointerup', end);
      scr.addEventListener('pointercancel', end);
      scr.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !drag) { C.hx = 0; C.hy = 0; } });
      const LOOK_KEYS = { a: 1, d: 1, w: 1, s: 1, arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1 };
      const free = function (e) {
        if (!self.running || e.metaKey || e.ctrlKey || e.altKey) return false;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
        return ['#ovRule', '#ovPause', '#ovEnd'].every(function (s) { const o = $(s); return !o || o.hidden; });
      };
      window.addEventListener('keydown', function (e) {
        const k = (e.key || '').toLowerCase();
        if (!free(e)) return;
        if (LOOK_KEYS[k]) { self.keys[k] = true; self.looked(); e.preventDefault(); }
        else if (k === 'c') { self.recenter(); }
      });
      window.addEventListener('keyup', function (e) { delete self.keys[(e.key || '').toLowerCase()]; });
      window.addEventListener('blur', function () { self.keys = {}; });
      const btn = $('#gCenter');
      if (btn) btn.addEventListener('click', function () { self.recenter(); if (K.Sfx) K.Sfx.play('click'); });
      this.stepLook = function (dt) {
        const kk = self.keys;
        const h = (kk.a || kk.arrowleft ? 1 : 0) - (kk.d || kk.arrowright ? 1 : 0);
        const v = (kk.w || kk.arrowup ? 1 : 0) - (kk.s || kk.arrowdown ? 1 : 0);
        if (h || v) { C.tYaw += h * 1.5 * dt; C.tPitch += v * 0.9 * dt; clampLook(); }
        const a = 1 - Math.pow(0.0009, dt);   // frame-rate independent smoothing
        C.yaw = lerp(C.yaw, C.tYaw + C.hx, a);
        C.pitch = lerp(C.pitch, C.tPitch + C.hy, a);
        if (btn) {
          const turned = Math.abs(C.tYaw) > 0.14 || Math.abs(C.tPitch) > 0.12;
          if (turned !== self._turned) { self._turned = turned; btn.classList.toggle('show', turned); }
        }
      };
      try { this.lookUsed = localStorage.getItem('kod.looked') === '1'; } catch (e) { this.lookUsed = false; }
    },
    showLookHint: function () {
      const el = $('#lookHint'); if (!el || this.lookUsed) return;
      const self = this, t = $('#lookHintT');
      if (t) t.textContent = K.t(window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'lookHint' : 'lookHintKeys');
      clearTimeout(this._hintT);
      this._hintT = setTimeout(function () { el.classList.add('show'); self._hintT = setTimeout(function () { self.hideLookHint(); }, 6500); }, 2200);
    },
    hideLookHint: function () { clearTimeout(this._hintT); const el = $('#lookHint'); if (el) el.classList.remove('show'); },
    /* cinematic: swing the camera onto one player (or back to the table with null) */
    focus: function (id) {
      const C = this.cam; if (!C) return;
      const c = id ? this.ch(id) : null;
      if (c) {
        const h = c.headWorld(new T.Vector3());
        C.fx = h.x; C.fy = h.y + 0.12; C.fz = h.z;
        tween(C, 'fw', 0.74, 900, 'inout'); tween(C, 'zoom', 0.7, 900, 'inout');
      } else { tween(C, 'fw', 0, 900, 'inout'); tween(C, 'zoom', 1, 900, 'inout'); }
    },
    resize: function () {
      if (!this.renderer) return;
      const el = this.host || $('#scr-game'), w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.w = w; this.h = h;
      const a = w / h, t = clamp((1.45 - a) / 0.95, 0, 1);
      this.fovWin = lerp(56, 70, t); this.lookT = t;
      this.cam.pos.set(0, lerp(1.92, 3.6, t), lerp(2.95, 5.0, t));
      this.cam.look.set(0, lerp(0.88, 0.7, t), lerp(-0.45, -0.3, t));
    },
    start: function () {
      if (!this.init() || this.running) return;
      this.running = true;
      const self = this;
      const loop = function (now) { if (!self.running) return; try { self.frame(now); } catch (e) { console.error(e); } requestAnimationFrame(loop); };
      this.resize();
      requestAnimationFrame(loop);
    },
    stop: function () { this.running = false; this.keys = {}; this.hideLookHint(); },
    frame: function (now) {
      const t = now / 1000, cam = this.camera, C = this.cam;
      const hostEl = this.host || $('#scr-game');
      if (this.w !== (hostEl.clientWidth || this.w) || this.h !== (hostEl.clientHeight || this.h)) this.resize();
      runTweens(tickClock(now));
      if (this.attracting) { this.attractFrame(now, t, cam); return; }
      const mon = $('.mon-wrap'), tz = $('#tz');
      let yT = this.h / 2;
      if (mon && tz) { const mr = mon.getBoundingClientRect(), mb = mr.height > 0 && mr.bottom > 0 ? mr.bottom : 0, pt = tz.getBoundingClientRect().top; this.monBottom = mb; if (pt > mb) yT = (mb + pt) / 2; }
      C.yT = C.yT == null ? yT : lerp(C.yT, yT, 0.08);
      const H2 = C.yT > this.h / 2 ? 2 * C.yT : 2 * (this.h - C.yT), offY = C.yT > this.h / 2 ? 0 : H2 - this.h;
      cam.fov = 2 * Math.atan(Math.tan(this.fovWin * C.zoom * Math.PI / 360) * H2 / this.h) * 180 / Math.PI;
      cam.aspect = this.w / this.h;
      cam.setViewOffset(this.w, H2, 0, offY, this.w, this.h);
      cam.updateProjectionMatrix();
      const dt = this.lastT ? clamp((now - this.lastT) / 1000, 0, 0.1) : 0.016; this.lastT = now;
      if (this.stepLook) this.stepLook(dt);
      const sh = C.shake; C.shake = Math.max(0, C.shake - 0.04);
      const bob = Math.sin(t * 1.1) * 0.004;
      cam.position.set(C.pos.x + (Math.random() - 0.5) * sh * 0.08, C.pos.y - C.drop + bob + (Math.random() - 0.5) * sh * 0.06, C.pos.z);
      // where the head points: the table (or the cinematic focus target), then turned by free look
      const bx = C.pos.x, by = C.pos.y - C.drop, bz = C.pos.z;
      let lx = lerp(C.look.x, C.fx, C.fw) - bx, ly = lerp(C.look.y, C.fy, C.fw) - C.drop * 0.6 - C.tilt - by, lz = lerp(C.look.z, C.fz, C.fw) - bz;
      const free = 1 - clamp(C.fw / 0.74, 0, 1), yaw = C.yaw * free, pitch = C.pitch * free;
      if (yaw || pitch) {
        const cs = Math.cos(yaw), sn = Math.sin(yaw), nx = lx * cs + lz * sn, nz = -lx * sn + lz * cs;
        const hz = Math.hypot(nx, nz), el = clamp(Math.atan2(ly, hz) + pitch, -1.35, 1.35);
        lx = nx; lz = nz; ly = Math.tan(el) * hz;
      }
      cam.lookAt(bx + lx, by + ly, bz + lz);
      cam.rotateZ(C.roll);
      if (this.cine) {
        const Q = this.cine;
        cam.clearViewOffset(); cam.fov = Q.fov; cam.updateProjectionMatrix();
        cam.position.set(Q.px + (Math.random() - 0.5) * sh * 0.05, Q.py + (Math.random() - 0.5) * sh * 0.04, Q.pz);
        cam.lookAt(Q.lx, Q.ly, Q.lz);
      }
      const hint = this._hintEl || (this._hintEl = $('#lookHint'));
      if (hint && hint.classList.contains('show')) hint.style.top = C.yT.toFixed(0) + 'px';
      this.chars.forEach(function (c) {
        if (c.dead) return;
        c.torso.scale.y = 1 + Math.sin(t * 1.6 + c.phase) * 0.012;
        c.headP.rotation.y = Math.sin(t * 0.5 + c.phase) * 0.12 + (c.lookY || 0);
      });
      this.diamond.rotation.y = t * 1.2;
      this.diamond.position.y = H_TABLE + 0.2 + Math.sin(t * 2) * 0.015;
      if (!window.__KOD_NORENDER) this.renderer.render(this.scene, cam);
      this.updateHud();
    },
    project: function (v) {
      const p = v.clone().project(this.camera);
      return { x: (p.x + 1) / 2 * this.w, y: (1 - p.y) / 2 * this.h, ok: p.z < 1 && p.z > -1 };
    },
    updateHud: function () {
      const self = this, v = new T.Vector3();
      this.chars.forEach(function (c, i) {
        const pl = document.getElementById('pl-' + i), bu = document.getElementById('bu-' + i);
        c.headWorld(v); v.y += c.dead ? 0.42 : 0.36;
        let s = self.project(v);
        if (s.y - 34 < (self.monBottom || 0)) { c.headWorld(v); v.y -= 0.4; s = self.project(v); s.y += 30; }
        if (pl) { pl.style.left = s.x.toFixed(1) + 'px'; pl.style.top = s.y.toFixed(1) + 'px'; pl.style.visibility = s.ok ? '' : 'hidden'; }
        v.y += 0.22;
        s = self.project(v);
        if (bu) { bu.style.left = s.x.toFixed(1) + 'px'; bu.style.top = s.y.toFixed(1) + 'px'; }
      });
    },

    /* ---------- API used by the game ---------- */
    holo: function (text, sub, mode) {
      if (!this.holoSprite) return;
      const c = this.holoSprite.userData.canvas, x = c.getContext('2d');
      x.clearRect(0, 0, 512, 256);
      const col = mode === 'red' ? '#FF5A6E' : mode === 'gold' ? '#FFC54A' : '#FFE8B0';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = col; x.shadowBlur = 24;
      x.fillStyle = col; x.font = '800 118px Unbounded, Arial Black, sans-serif';
      x.fillText(String(text), 256, 140);
      if (sub) { x.shadowBlur = 10; x.font = '700 34px Martian Mono, monospace'; x.fillStyle = 'rgba(255,232,176,.85)'; x.fillText(String(sub).slice(0, 18), 256, 40); }
      this.holoSprite.userData.tex.needsUpdate = true;
      const s = this.holoSprite.scale; s.set(0.6, 0.3, 1);
      tween(s, 'x', 0.95, 380, 'back'); tween(s, 'y', 0.475, 380, 'back');
    },
    crown: function (id) { this.chars.forEach(function (c) { c.crown.visible = c.id === id; }); },
    has: function (id) { return this.idx[id] !== undefined; },
    ch: function (id) { if (this.me && id === this.me.id) return this.me; const i = this.idx[id]; return i === undefined ? null : this.chars[i]; },
    el: function (pre, id) { const i = this.idx[id]; return i === undefined ? null : document.getElementById(pre + i); },
    seat: function (id) { return this.seats[this.idx[id]]; },
    expr: function (id, ex) {
      const c = this.ch(id); if (!c || c.dead) return;
      c.setFace({ expr: ex });
      tween(c.headP.rotation, 'z', { think: -0.08, smirk: 0.05, smile: 0.06, grin: 0.08, frown: -0.05 }[ex] || 0, 400);
    },
    gaze: function (id, dir) {
      const c = this.ch(id); if (!c || c.dead) return;
      c.setFace({ gaze: GAZE[dir] || GAZE.center });
      c.lookY = dir === 'left' ? -0.15 : dir === 'right' ? 0.15 : 0;
      tween(c.headP.rotation, 'x', dir === 'up' ? -0.18 : dir === 'down' ? 0.22 : 0, 450);
    },
    lookAt: function (id, target) {
      const a = this.ch(id), b = this.ch(target);
      if (!a) return;
      if (!b) { this.gaze(id, 'down'); return; }
      const local = a.root.worldToLocal(b.root.position.clone());
      if (Math.abs(local.x) < 0.25 && local.z > 0) { this.gaze(id, 'center'); return; }
      this.gaze(id, local.x > 0 ? 'left' : 'right');
    },
    led: function (id, state) { const c = this.ch(id); if (c && !c.dead) c.setLed(state); },
    /* one accent spotlight follows whoever is in trouble (red) or winning (gold) */
    spot: function (id, mode) {
      const c = this.ch(id); if (!c || !this.accent) return;
      const A = this.accent;
      if (mode === 'red' || mode === 'gold') {
        A.color.set(mode === 'red' ? 0xff2a3a : 0xffc54a);
        A.position.set(c.root.position.x * 0.8, 3.2, c.root.position.z * 0.8);
        A.target.position.set(c.root.position.x, 1.0, c.root.position.z);
        this.accentId = id;
        A.intensity = 0; tween(A, 'intensity', mode === 'red' ? 40 : 30, 300);
      } else if (this.accentId === id) { tween(A, 'intensity', 0, 400); this.accentId = null; }
    },
    flip: function (id, num) {
      const c = this.ch(id); if (!c || c.dead) return;
      c.drawScreen(num);
      if (!this.attracting) K.Sfx.play('flip');
      tween(c.tabInner.rotation, 'y', Math.PI, 420, 'back');
      tween(c.tablet.rotation, 'x', -0.05, 420);
      tween(c.tablet.position, 'y', c.handY + 0.15, 420);
    },
    resetTablets: function () {
      this.chars.forEach(function (c) {
        if (c.dead) return;
        c.tabInner.rotation.y = 0; c.tablet.rotation.x = -0.25; c.tablet.position.y = c.handY + 0.1;
      });
    },
    tap: function (id) {
      const c = this.ch(id); if (!c || c.dead) return;
      const y0 = c.handY + 0.1;
      tween(c.tablet.position, 'y', y0 - 0.03, 120, 'out', function () { tween(c.tablet.position, 'y', y0, 160); });
    },
    hurt: function (id) {
      const c = this.ch(id); if (!c || c.dead) return;
      const m = c.headMesh.material;
      m.emissive = new T.Color(0xff1020); m.emissiveIntensity = 0.9;
      tween(m, 'emissiveIntensity', 0, 700);
      tween(c.torso.rotation, 'x', -0.12, 90, 'out', function () { if (!c.dead) tween(c.torso.rotation, 'x', 0, 400); });
    },
    blink: function (id) {
      const c = this.ch(id); if (!c || c.dead) return;
      c.setFace({ blink: true });
      setTimeout(function () { if (!c.dead) c.setFace({ blink: false }); }, 130);
    },
    bubble: function (id, text) {
      const b = this.el('bu-', id); if (!b) return;
      b.textContent = text; b.classList.add('show');
      clearTimeout(b._t);
      b._t = setTimeout(function () { b.classList.remove('show'); }, 2300);
    },
    placard: function (id, o) {
      const el = this.el('pl-', id); if (!el) return;
      let pips = '';
      for (let i = 0; i < o.total; i++) {
        const was = o.drainFrom != null && i < o.drainFrom && i >= o.hp;
        pips += '<i class="pip' + (i < o.hp ? '' : (was ? ' drain' : ' off')) + '"></i>';
      }
      el.innerHTML = '<span class="pl-n">' + o.name + '</span><span class="pl-r">' + o.role + '</span><span class="pips">' + pips + '</span>';
      el.setAttribute('data-out', K.t('eliminated'));
      el.classList.toggle('out', !!o.out);
      if (o.show) el.classList.remove('hide');
    },
    talking: function (id, on) { const el = this.el('pl-', id); if (el) el.classList.toggle('talking', !!on); },
    rect: function () { return null; },
    shake: function (amt) { if (this.cam) this.cam.shake = Math.max(this.cam.shake, amt || 1); },

    /* ---------- the execution ---------- */
    execute: function (id, gore, onShot, opts) {
      const c = this.ch(id);
      if (!c || !this.ok) return Promise.resolve();
      opts = opts || {};
      const self = this, S = this.scene, tx = textures();
      const head = c.headWorld(new T.Vector3());
      const toCenter = new T.Vector3(-c.root.position.x, 0, -c.root.position.z).normalize();
      const aimPoint = head.clone().addScaledVector(toCenter, 0.13).add(new T.Vector3(0, 0.03, 0));
      const mount = head.clone().addScaledVector(toCenter, opts.out || 0.75).add(new T.Vector3(0, opts.up || 0.95, 0));
      const skip = function () { return opts.skipped && opts.skipped(); };
      const pause = function (ms) { return skip() ? Promise.resolve() : wait(ms); };
      const tur = new T.Group();
      const metal = mat('#2A2F3A', { metalness: 0.85, roughness: 0.35 });
      const cable = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 3, 6), metal); cable.position.y = 1.55; tur.add(cable);
      tur.add(new T.Mesh(new T.BoxGeometry(0.2, 0.13, 0.18), metal));
      const eye = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), new T.MeshBasicMaterial({ color: 0xff2030, toneMapped: false })); eye.position.set(0.06, 0.03, 0.09); tur.add(eye);
      const gun = new T.Group(); tur.add(gun);
      const barrel = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, 0.3, 12), metal); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.17; gun.add(barrel);
      const flash = new T.Sprite(new T.SpriteMaterial({ map: tx.glow, color: 0xfff0a0, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      flash.scale.set(0.5, 0.5, 1); flash.position.z = 0.36; gun.add(flash);
      tur.position.copy(mount).add(new T.Vector3(0, 2.2, 0));
      S.add(tur);
      const laserM = new T.MeshBasicMaterial({ color: 0xff1a2e, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
      const laser = new T.Mesh(new T.CylinderGeometry(0.0035, 0.0035, 1, 6), laserM); S.add(laser);
      const dot = new T.Sprite(new T.SpriteMaterial({ map: tx.redGlow, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      dot.scale.set(0.07, 0.07, 1); dot.position.copy(aimPoint); S.add(dot);
      const placeLaser = function () {
        gun.lookAt(aimPoint); tur.updateMatrixWorld(true);
        const tip = new T.Vector3(0, 0, 0.34); gun.localToWorld(tip);
        const d = new T.Vector3().subVectors(aimPoint, tip), len = d.length();
        laser.scale.set(1, len, 1); laser.position.copy(tip).addScaledVector(d, 0.5);
        laser.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
        return tip;
      };
      return (async function () {
        K.Sfx.play('servo');
        await new Promise(function (r) { tween(tur.position, 'y', mount.y, skip() ? 1 : 800, 'back', r); });
        placeLaser();
        if (opts.onAim) opts.onAim();
        tween(laserM, 'opacity', 0.85, 200); tween(dot.material, 'opacity', 1, 200);
        K.Sfx.play('laser');
        self.expr(id, 'shock'); self.gaze(id, 'up');
        let jit = 0;
        const jitter = setInterval(function () { jit++; dot.position.copy(aimPoint).add(new T.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, 0)); dot.scale.setScalar(0.06 + (jit % 2) * 0.03); }, 60);
        await pause(opts.aim || 1150);
        clearInterval(jitter);
        const tip = placeLaser();
        laserM.opacity = 0; dot.material.opacity = 0;
        flash.material.opacity = 1; self.flashLight.position.copy(tip); self.flashLight.intensity = 60;
        setTimeout(function () { flash.material.opacity = 0; self.flashLight.intensity = 0; }, 90);
        K.Sfx.play('shot');
        self.shake(1.4);
        self.kill(c, gore, toCenter);
        if (onShot) onShot();
        const hp = self.project(aimPoint), sl = opts.slow ? 0.4 : 1;
        if (gore) K.FX.burst(hp.x, hp.y, { n: 70, cols: ['#B3122A', '#8E0E1A', '#E8344E'], speed: 6 * sl, up: 0.5, g: 0.28 * sl * sl, size: 3.2, shape: 'sq' });
        else K.FX.burst(hp.x, hp.y, { n: 26, cols: ['#FFFFFF', '#FFE08A'], speed: 3 * sl, g: 0.05, size: 2.5, shape: 'glow' });
        await pause(opts.after || 1500);
        tween(tur.position, 'y', mount.y + 2.4, 900, 'in', function () { S.remove(tur); S.remove(laser); S.remove(dot); });
        await pause(400);
      })();
    },
    /* a seat that was already empty when we joined or came back: no animation */
    killQuiet: function (id) {
      const c = this.ch(id); if (!c || c.dead) return;
      c.dead = true; c.setFace({ dead: true, blood: false, expr: 'shock' }); c.setLed(null);
      c.headP.rotation.x = 0.55; c.headP.rotation.z = 0.35; c.torso.rotation.x = 0.62;
      c.tablet.rotation.x = -1.45; c.tablet.position.y = c.handY - 0.02;
      const grey = new T.Color(0x555555);
      c.mats.forEach(function (m) { if (m.color && !m.map) m.color.lerp(grey, 0.45).multiplyScalar(0.55); else if (m.color) m.color.multiplyScalar(0.5); });
    },
    kill: function (c, gore, toCenter) {
      c.dead = true;
      c.setFace({ dead: true, blood: !!gore, expr: 'shock' });
      c.setLed(null);
      tween(c.headP.rotation, 'x', -0.6, 70, 'out', function () {
        tween(c.headP.rotation, 'x', 0.55, 1100, 'inout');
        tween(c.headP.rotation, 'z', 0.35, 1100, 'inout');
      });
      tween(c.torso.rotation, 'x', -0.18, 70, 'out', function () { tween(c.torso.rotation, 'x', 0.62, 1200, 'in'); });
      tween(c.tablet.rotation, 'x', -1.45, 900, 'in');
      tween(c.tablet.position, 'y', c.handY - 0.02, 900, 'in');
      if (gore) {
        const tx = textures();
        const splat = new T.Mesh(new T.PlaneGeometry(0.62, 0.62), new T.MeshStandardMaterial({ map: tx.splat, transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
        splat.position.set(0.05, 0.42, 0.045); splat.scale.setScalar(0.1); c.chairBack.add(splat);
        tween(splat.scale, 'x', 1, 160); tween(splat.scale, 'y', 1, 160);
        const pool = new T.Mesh(new T.CircleGeometry(0.2, 24), new T.MeshStandardMaterial({ map: tx.splat, transparent: true, roughness: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
        const pos = c.root.position.clone().addScaledVector(toCenter, D_SEAT - R_TABLE + 0.35);
        pool.position.set(pos.x, H_TABLE + 0.006, pos.z); pool.rotation.x = -Math.PI / 2; pool.scale.setScalar(0.05);
        this.dynamic.add(pool);
        setTimeout(function () { tween(pool.scale, 'x', 1.4, 4000); tween(pool.scale, 'y', 1.4, 4000); }, 900 * speed());
      }
      setTimeout(function () {
        const grey = new T.Color(0x555555);
        c.mats.forEach(function (m) { if (m.color && !m.map) m.color.lerp(grey, 0.45).multiplyScalar(0.55); else if (m.color) m.color.multiplyScalar(0.5); });
      }, 1600 * speed());
    },
    /* ---------- attract mode: the live card room behind the landing page ---------- */
    attract: function (hostEl) {
      if (!this.init()) return false;
      const cv = this.renderer.domElement;
      this.host = hostEl; hostEl.insertBefore(cv, hostEl.firstChild);
      if (!this.attracting) {
        this.attracting = true;
        const bots = window.KODPresets.pickBots(6, []).map(function (b, i) { return { id: 'a' + i, name: b.name, avatar: b.avatar, bot: true, type: b.type }; });
        this.build(bots, null, true);
        this.renderer.setPixelRatio(window.__KOD_SHOT ? 0.6 : Math.min(window.innerWidth < 700 ? 1.25 : 1.5, window.devicePixelRatio || 1));
        this.aNext = 0; this.aPhase = 0;
      }
      this.resize();
      this.start();
      return true;
    },
    attractStop: function () {
      if (!this.renderer) return;
      this.attracting = false; this.host = null;
      const g = $('#scr-game'), cv = this.renderer.domElement;
      if (cv.parentNode !== g) g.insertBefore(cv, g.firstChild);
      this.renderer.setPixelRatio(window.__KOD_SHOT ? 0.6 : Math.min(window.innerWidth < 700 ? 1.5 : 1.75, window.devicePixelRatio || 1));
      this.stop();
      this.resize();
    },
    attractFrame: function (now, t, cam) {
      const self = this, a = t * 0.055, wide = this.w / this.h > 1.1;
      const R = wide ? 3.7 : 4.6, H = wide ? 2.05 : 2.6;
      cam.clearViewOffset();
      cam.fov = wide ? 46 : 58; cam.aspect = this.w / this.h; cam.updateProjectionMatrix();
      cam.position.set(Math.sin(a) * R, H + Math.sin(t * 0.21) * 0.12, Math.cos(a) * R);
      cam.lookAt(0, wide ? 0.95 : 1.05, 0);
      this.chars.forEach(function (c) {
        c.torso.scale.y = 1 + Math.sin(t * 1.6 + c.phase) * 0.012;
        c.headP.rotation.y = Math.sin(t * 0.5 + c.phase) * 0.12 + (c.lookY || 0);
      });
      this.diamond.rotation.y = t * 1.2;
      this.diamond.position.y = H_TABLE + 0.2 + Math.sin(t * 2) * 0.015;
      // a round plays itself: everyone thinks, numbers flip up, a winner glows gold
      if (now > this.aNext) {
        const ids = this.chars.map(function (c) { return c.id; });
        if (this.aPhase === 0) {
          this.resetTablets();
          ids.forEach(function (id) { self.led(id, 'think'); self.expr(id, ['think', 'neutral', 'smirk'][Math.floor(Math.random() * 3)]); self.gaze(id, ['down', 'left', 'right', 'center'][Math.floor(Math.random() * 4)]); });
          this.holo('?', 'ROUND ' + (1 + Math.floor(Math.random() * 9)), '');
          this.aNext = now + 3200;
        } else if (this.aPhase === 1) {
          const picks = ids.map(function () { return Math.floor(Math.random() * 60) + 5; });
          const avg = picks.reduce(function (x, y) { return x + y; }, 0) / picks.length, tg = avg * 0.8;
          let best = 0; picks.forEach(function (v, i) { if (Math.abs(v - tg) < Math.abs(picks[best] - tg)) best = i; });
          ids.forEach(function (id, i) { setTimeout(function () { if (self.attracting) { self.led(id, 'lock'); self.flip(id, picks[i]); } }, i * 260); });
          this.aWin = ids[best]; this.aTarget = tg;
          this.aNext = now + 2600;
        } else {
          this.holo(this.aTarget.toFixed(1), (this.ch(this.aWin).p.name || '').toUpperCase(), 'gold');
          this.spot(this.aWin, 'gold'); this.expr(this.aWin, 'grin');
          const win = this.aWin;
          ids.forEach(function (id) { if (id !== win) { self.expr(id, 'frown'); self.lookAt(id, win); } });
          setTimeout(function () { self.spot(win, 'off'); }, 2800);
          this.aNext = now + 3400;
        }
        this.aPhase = (this.aPhase + 1) % 3;
      }
      if (!window.__KOD_NORENDER) this.renderer.render(this.scene, cam);
    },

    /* ---------- cinematic camera: watch yourself from across the table ---------- */
    cineStart: function () {
      if (!this.me || !this.cam) return false;
      const H = this.me.headWorld(new T.Vector3());
      this.cineH = H;
      this.cine = { px: H.x + 0.55, py: H.y + 0.22, pz: H.z - 2.15, lx: H.x, ly: H.y + 0.28, lz: H.z - 0.3, fov: 44 };
      this.me.root.visible = true;
      if (this.holoSprite) this.holoSprite.visible = false;
      this.hideLookHint();
      return true;
    },
    /* move the cinematic camera to a shot, relative to your head: p = camera offset, l = look offset */
    cineShot: function (p, l, fov, ms, ease) {
      const C = this.cine, H = this.cineH; if (!C) return;
      const to = { px: H.x + p[0], py: H.y + p[1], pz: H.z + p[2], lx: H.x + l[0], ly: H.y + l[1], lz: H.z + l[2], fov: fov };
      Object.keys(to).forEach(function (k) { if (ms) tween(C, k, to[k], ms, ease || 'inout'); else C[k] = to[k]; });
    },
    slowmo: function (scale) { clock.scale = scale; },
    cineEnd: function () {
      this.cine = null; clock.scale = 1;
      if (this.holoSprite) this.holoSprite.visible = true;
      if (this.me) this.me.root.visible = false;
    },
    /* first person: you take the shot */
    youDie: function () {
      if (!this.cam) return;
      const C = this.cam;
      this.shake(2);
      tween(C, 'roll', 0.42, 1300, 'in');
      tween(C, 'drop', 0.55, 1300, 'in');
      tween(C, 'tilt', 0.35, 1300, 'in');
    },
    reviveCam: function () { const C = this.cam; if (!C) return; tween(C, 'roll', 0.12, 900); tween(C, 'drop', 0.15, 900); tween(C, 'tilt', 0.1, 900); }
  };

  K.Scene = Scene;
})();
