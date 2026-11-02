/* King of Diamonds: the in-game presentation. It listens to match events (from the local engine or
   the server) and plays them out: intro, rounds, reveal, eliminations, new rules, the end. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const $ = function (s) { return document.querySelector(s); };
  const t = function () { return K.t.apply(null, arguments); };
  const fmt = function (x) { return x.toFixed(2); };
  const spk = function (x) { return String(Number(x.toFixed(2))); };
  const pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  const Scene = function () { return K.Scene; };

  const G = {
    s: null, token: 0, q: Promise.resolve(), players: {}, me: null, hpMax: 6, timer: 40, round: 0, phase: 'idle',
    entry: '', myPick: null, locked: {}, alive: [], paused: false, history: [], last: null, stats: { won: 0, close: null },
    cd: null, nextResolve: null, ruleResolve: null, idleIv: null, blinkIv: null
  };
  const speed = function () { return K.FAST ? 0.02 : 1; };
  const live = function (tok) { return function () { return tok === G.token; }; };

  function sleep(ms) {
    return new Promise(function (r) {
      let left = ms * speed(), last = performance.now();
      const iv = setInterval(function () {
        const now = performance.now();
        if (!G.paused) left -= now - last;
        last = now;
        if (left <= 0) { clearInterval(iv); r(); }
      }, 30);
    });
  }
  let skipFn = null, skipped = false, speakId = 0;
  function capSleep(ms) {
    return new Promise(function (r) {
      let left = ms * speed(), last = performance.now();
      const iv = setInterval(function () {
        const now = performance.now();
        if (!G.paused) left -= now - last;
        last = now;
        if (left <= 0) done();
      }, 40);
      function done() { clearInterval(iv); if (skipFn === done) skipFn = null; r(); }
      skipFn = done;
    });
  }
  async function say(text, keys) {
    const id = ++speakId;
    $('#capT').textContent = text; $('#live').textContent = text;
    $('#scr-game').classList.add('speaking');
    skipped = false;
    const t0 = performance.now();
    let spoke = false;
    if (K.settings.voice && keys && K.Ann && K.Ann.has(keys) && !K.FAST) { K.Voice.stop(); spoke = await K.Ann.play(keys); }
    else if (K.settings.voice && K.Voice.available(K.lang)) { if (K.Ann) K.Ann.stop(); spoke = await K.Voice.speak(text, K.lang); }
    const minShow = text.length * 28;
    if (!spoke) await capSleep(Math.min(5200, Math.max(1300, text.length * 52)));
    else if (!skipped && performance.now() - t0 < minShow * speed() && id === speakId) await capSleep(minShow - (performance.now() - t0) / speed());
    if (id === speakId) $('#scr-game').classList.remove('speaking');
  }
  function skipLine() { skipped = true; K.Voice.stop(); if (K.Ann) K.Ann.stop(); if (skipFn) skipFn(); }
  /* recorded announcer pieces */
  function vNum(x) {
    const parts = spk(x).split('.'), keys = ['n_' + parts[0]];
    if (parts[1]) { keys.push('point'); parts[1].split('').forEach(function (d) { keys.push('d_' + d); }); }
    return keys;
  }
  function seatNo(id) { return Object.keys(G.players).indexOf(id) + 1; }
  function vName(id) {
    const p = P(id); if (!p) return [];
    const k = 'name_' + String(p.name).toLowerCase(), m = window.KOD_VOICE && window.KOD_VOICE[K.lang];
    if (p.wasBot && m && m[k]) return [k];
    return ['seat_' + seatNo(id)];
  }
  function vNames(ids) {
    const out = [];
    ids.forEach(function (id, i) { if (i > 0 && i === ids.length - 1) out.push('and'); Array.prototype.push.apply(out, vName(id)); });
    return out;
  }
  function vWin(id) { return id === G.me ? ['win_you'] : vName(id).concat(['win_sfx']); }

  /* ---------- helpers ---------- */
  function P(id) { return G.players[id]; }
  function nm(id) { return id === G.me ? t('you') : (P(id) ? P(id).name : '?'); }
  function joinN(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' ' + t('and') + ' ' + a[a.length - 1]; }
  function roleOf(p) {
    if (!p.connected && !p.wasBot) return t('left');
    if (p.bot) return t('type' + p.type.charAt(0).toUpperCase() + p.type.slice(1));
    return t('player');
  }
  function head(id, expr) { const p = P(id); return p ? K.avatarHead(p.avatar, expr) : ''; }
  function col(id) { const p = P(id); return p ? K.accentOf(p.avatar) : '#888'; }
  function others() { return Object.keys(G.players).filter(function (id) { return id !== G.me; }); }
  function aliveOthers() { return others().filter(function (id) { return P(id).alive; }); }
  function placard(id, drainFrom, show) {
    const p = P(id);
    Scene().placard(id, { name: p.name, role: roleOf(p), hp: p.hp, total: G.hpMax, drainFrom: drainFrom, out: !p.alive && p.outShown, show: show });
  }
  function flashScreen(cls) { const f = $('#flash'); f.classList.remove('go', 'white'); void f.offsetWidth; if (cls) f.classList.add(cls); f.classList.add('go'); }
  function shake() { const g = $('#scr-game'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); }
  function banner(kind, small, big, ms) {
    const b = $('#banner');
    b.innerHTML = '<div class="bn ' + kind + '">' + (small ? '<small>' + small + '</small>' : '') + '<b>' + big + '</b></div>';
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.innerHTML = ''; }, (ms || 2000) * (K.FAST ? 0.05 : 1));
  }
  function taunt(id, kind, chance) {
    const p = P(id);
    if (!p || !p.bot || Math.random() > (chance == null ? 1 : chance)) return;
    const set = K.TAUNT[p.type] && K.TAUNT[p.type][kind];
    if (set) Scene().bubble(id, pick(set[K.lang] || set.en));
  }
  function burstAt(el, opts) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    K.FX.burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  }

  /* ---------- monitor ---------- */
  function stage(html) { $('#mStage').innerHTML = html; $('#mon').classList.remove('alarm'); }
  function updateHead(fresh) {
    const n = G.alive.length || Object.keys(G.players).length;
    $('#mRound').innerHTML = G.round ? t('round') + ' <b>' + (G.round < 10 ? '0' : '') + G.round + '</b>' : '<b>&#9830;</b>';
    $('#mAlive').innerHTML = '<b>' + n + '</b> ' + t('alive');
    const r = K.RULES_FOR(n, G.start), inPlay = window.KODRules.rulesInPlay(G.start || 5);
    $('#lamps').innerHTML = K.RULES.map(function (x, i) {
      if (inPlay.indexOf(x.k) < 0) return '';
      const on = x.k === 'core' || r[x.k];
      return '<span class="lamp' + (on ? ' on' : '') + (fresh === x.k ? ' fresh' : '') + '" title="' + x.t[K.lang] + '">' + (i + 1) + '</span>';
    }).join('');
  }
  const gore = function () { return K.settings.violence !== 'clean'; };
  function glass(on) {
    const g = $('#glass'); if (!g) return;
    if (on) { g.removeAttribute('hidden'); g.classList.toggle('gore', gore()); } else g.setAttribute('hidden', '');
  }
  function monitorEmblem() { stage('<div class="scr"><div class="emblem">KING<small>OF</small><span>DIAMONDS</span></div></div>'); }
  function monitorPick() {
    const last = G.history[G.history.length - 1];
    const hint = last ? t('hintLast', fmt(last.avg), fmt(last.target)) : t('hintFirst');
    const row = G.alive.map(function (id) { return '<span class="lk" id="lk-' + id.replace(/[^a-zA-Z0-9_-]/g, '') + '" style="--c:' + col(id) + '" title="' + nm(id) + '">' + head(id) + '</span>'; }).join('');
    stage('<div class="scr"><div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" id="ringFg" cx="50" cy="50" r="44"/></svg><b id="ringN">' + G.timer + '</b></div>' +
      '<div><p class="scr-k">' + t('round') + ' ' + G.round + '</p><h2 class="scr-h">' + t('choose') + '</h2><p class="scr-p">' + hint + '</p><div class="lockrow">' + row + '</div></div></div>');
  }
  function lkEl(id) { return document.getElementById('lk-' + id.replace(/[^a-zA-Z0-9_-]/g, '')); }
  function chipEl(id) { return document.getElementById('chip-' + id.replace(/[^a-zA-Z0-9_-]/g, '')); }
  function monitorReveal() {
    let ticks = '';
    for (let v = 0; v <= 100; v += 5) ticks += '<span class="g-tick" style="left:' + v + '%;height:' + (v % 25 ? 6 : 10) + 'px">' + (v % 25 ? '' : '<em>' + v + '</em>') + '</span>';
    stage('<div class="graph"><div class="g-plot" id="gPlot"><div class="g-axis"></div>' + ticks +
      '<div class="gl avg" id="glAvg"></div><div class="gl tgt" id="glTgt"></div></div>' +
      '<div class="g-read"><span class="g-flag" id="gfAvg">' + t('average') + ' <b>—</b></span><span class="g-flag tgt" id="gfTgt">× 0.8 → ' + t('target') + ' <b>—</b></span></div></div>');
  }
  function levels(picks) {
    const sorted = picks.slice().sort(function (a, b) { return a.pick - b.pick; });
    const lv = {}, placed = [];
    sorted.forEach(function (p) {
      let l = 0;
      while (placed.some(function (q) { return q.l === l && Math.abs(q.pick - p.pick) < 9; })) l++;
      lv[p.id] = l; placed.push({ pick: p.pick, l: l });
    });
    return lv;
  }
  function setStep(lv) {
    const plot = $('#gPlot'); if (!plot) return;
    const maxLv = Math.max.apply(null, Object.keys(lv).map(function (k) { return lv[k]; }).concat([1]));
    plot.style.setProperty('--step', Math.max(14, Math.min(30, ((plot.clientHeight || 200) - 62) / maxLv)) + 'px');
  }
  function placeChip(id, v, lv, instant) {
    const plot = $('#gPlot'); if (!plot) return;
    const c = document.createElement('div');
    c.className = 'chip'; c.id = 'chip-' + id.replace(/[^a-zA-Z0-9_-]/g, '');
    c.style.cssText = '--x:' + v + '%;--lv:' + lv + ';--c:' + col(id);
    c.innerHTML = '<span class="c-av">' + head(id) + '</span><b>' + v + '</b>';
    plot.appendChild(c);
    if (instant) c.classList.add('in');
    else requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.add('in'); }); });
  }
  function countUp(el, to, ms) {
    const t0 = performance.now(), d = ms * speed();
    const step = function (now) { const p = Math.min(1, (now - t0) / d); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function showAvg(x, instant) {
    const l = $('#glAvg'), tl = $('#glTgt'); if (!l) return;
    l.style.setProperty('--x', x + '%'); l.classList.add('on'); tl.style.setProperty('--x', x + '%');
    $('#gfAvg').classList.add('on');
    const b = $('#gfAvg b'); if (instant) b.textContent = fmt(x); else countUp(b, x, 900);
  }
  function showTgt(x, instant) {
    const tl = $('#glTgt'); if (!tl) return;
    tl.classList.add('on');
    if (instant) tl.style.setProperty('--x', x + '%'); else requestAnimationFrame(function () { tl.style.setProperty('--x', x + '%'); });
    $('#gfTgt').classList.add('on');
    const b = $('#gfTgt b'); if (instant) b.textContent = fmt(x); else countUp(b, x, 1100);
  }
  function markVerdict(res) {
    Object.keys(res.deltas).forEach(function (id) {
      const c = chipEl(id); if (!c) return;
      if (res.winners.indexOf(id) >= 0) c.classList.add('win'); else if (res.voided.indexOf(id) < 0) c.classList.add('lose');
    });
  }
  function markVoid(ids) { ids.forEach(function (id) { const c = chipEl(id); if (c) c.classList.add('void'); }); }
  function restoreGraph() {
    if (!G.last) return;
    monitorReveal();
    const lv = levels(G.last.picks); setStep(lv);
    G.last.picks.forEach(function (p) { placeChip(p.id, p.pick, lv[p.id], true); });
    showAvg(G.last.res.avg, true); showTgt(G.last.res.target, true);
    markVoid(G.last.res.voided); markVerdict(G.last.res);
  }
  function monitorElim(id) {
    stage('<div class="scr elim-scr" style="--c:' + col(id) + '"><p class="ek">' + t('eliminated') + '</p><h2>' + nm(id) + '</h2></div>');
    $('#mon').classList.add('alarm');
  }
  function monitorEnd(kind, text) { stage('<div class="scr end-scr ' + kind + '"><p class="scr-k">&#9830;</p><h2>' + text + '</h2></div>'); }
  function formula(avg, tgt) {
    const f = $('#formula');
    f.classList.remove('show'); void f.offsetWidth;
    f.innerHTML = '<span class="fa">' + fmt(avg) + '</span><span class="fx">× 0.8</span><span class="fe">=</span><span class="ft">' + fmt(tgt) + '</span>';
    f.classList.add('show');
  }

  /* ---------- your keypad ---------- */
  function padTop(timeTxt) {
    const me = P(G.me);
    let pips = '';
    for (let i = 0; i < G.hpMax; i++) pips += '<i class="pip' + (me && i < me.hp ? '' : ' off') + '"></i>';
    return '<div class="ps-top"><span class="ps-me" style="--c:' + col(G.me) + '">' + head(G.me) + '</span><span>' + (G.round ? 'R' + (G.round < 10 ? '0' : '') + G.round : '—') +
      '</span><span class="pips" id="psPips">' + pips + '</span>' + (G.crown === G.me && G.phase === 'pick' ? '<span class="ps-crown">&#9819; ' + t('crowned') + '</span>' : '') +
      '<span class="t" id="psTime">' + (timeTxt || '') + '</span></div>';
  }
  function renderPad(mode, data) {
    const el = $('#padScreen');
    if (mode === 'pick') {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫', 'C'];
      el.innerHTML = padTop() +
        '<div class="ps-row"><div class="ps-num"><span class="ps-lbl">' + t('yourNumber') + '</span><b class="ps-val empty" id="psVal">—</b></div>' +
        '<button type="button" class="ps-lock" id="psLock" disabled>' + t('lockIn') + '</button></div>' +
        '<div class="ps-keys">' + keys.map(function (k) {
          return '<button type="button" class="key' + (k === '⌫' || k === 'C' ? ' fn' : '') + '" data-k="' + k + '" aria-label="' + (k === '⌫' ? 'Delete' : k === 'C' ? 'Clear' : k) + '">' + k + '</button>';
        }).join('') + '</div>';
      el.querySelectorAll('.key').forEach(function (b) {
        b.addEventListener('click', function () { const k = b.dataset.k; if (k === '⌫') keyBack(); else if (k === 'C') keyClear(); else keyIn(k); });
      });
      $('#psLock').addEventListener('click', lockIn);
    } else if (mode === 'wait') {
      el.innerHTML = padTop() + '<div class="ps-msg"><span class="ps-lbl">' + t('locked') + '</span><span class="ps-big you stamp">' + G.myPick + '</span><span class="ps-sub">' + t('waitingOthers') + '</span></div>';
    } else if (mode === 'result') {
      const res = data.res, d = res.deltas[G.me];
      el.innerHTML = padTop() +
        '<div class="ps-res"><div><span>' + t('youPick') + '</span><b>' + (G.myPick == null ? '—' : G.myPick) + '</b></div><div><span>' + t('target') + '</span><b>' + fmt(res.target) + '</b></div>' +
        '<div><span>' + t('hpLabel') + '</span><b class="' + (d < 0 ? 'bad' : 'good') + '">' + (d < 0 ? '−' + (-d) : '+0') + '</b></div></div>' +
        '<button type="button" class="ps-next" id="psNext">' + t('next') + ' →</button>';
      $('#psNext').addEventListener('click', function () { K.Sfx.play('click'); if (G.nextResolve) G.nextResolve(); });
    } else if (mode === 'waitPlayers') {
      el.innerHTML = padTop() + '<div class="ps-msg"><span class="ps-big"><span class="dots"></span></span><span class="ps-sub">' + t('waitingPlayers') + '</span></div>';
    } else if (mode === 'spectate') {
      el.innerHTML = padTop() + '<div class="ps-msg"><span class="ps-big">' + t('eliminated') + '</span><span class="ps-sub">' + t('spectating') + '</span></div>';
    } else {
      el.innerHTML = padTop() + '<div class="ps-msg"><span class="ps-big">' + (data || '&#9830;') + '</span></div>';
    }
  }
  function updateEntry() {
    const v = $('#psVal'), l = $('#psLock'); if (!v) return;
    v.textContent = G.entry === '' ? '—' : G.entry;
    v.classList.toggle('empty', G.entry === '');
    v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump');
    l.disabled = G.entry === '';
  }
  function canType() { return G.phase === 'pick' && G.myPick == null && P(G.me) && P(G.me).alive; }
  function keyIn(d) {
    if (!canType()) return;
    let s = G.entry === '0' ? '' : G.entry;
    s += d;
    if (Number(s) > 100 || s.length > 3) s = d;
    G.entry = s; K.Sfx.play('key'); updateEntry();
  }
  function keyBack() { if (!canType()) return; G.entry = G.entry.slice(0, -1); K.Sfx.play('back'); updateEntry(); }
  function keyClear() { if (!canType()) return; G.entry = ''; K.Sfx.play('back'); updateEntry(); }
  function lockIn() {
    if (!canType() || G.entry === '') return;
    G.myPick = Number(G.entry);
    K.Sfx.play('lock');
    G.s.send('pick', { value: G.myPick });
    renderPad('wait');
    const lk = lkEl(G.me); if (lk) lk.classList.add('on');
  }
  function pressKey(k) {
    const b = document.querySelector('.key[data-k="' + k + '"]');
    if (b) { b.classList.add('hit'); setTimeout(function () { b.classList.remove('hit'); }, 110); }
  }

  /* ---------- countdown ---------- */
  function startCountdown(remMs) {
    stopCountdown();
    let rem = remMs, last = performance.now(), lastSec = null;
    const total = G.timer * 1000 * speed();
    const tick = function () {
      const now = performance.now();
      if (!G.paused) rem -= now - last;
      last = now;
      const r = Math.max(0, rem), sec = Math.ceil(r / speed() / 1000);
      const fg = $('#ringFg'); if (fg) fg.style.strokeDashoffset = (276.5 * (1 - r / total)).toFixed(1);
      const n = $('#ringN'); if (n) n.textContent = sec;
      const ring = $('#ring'); if (ring) ring.classList.toggle('hot', sec <= 10);
      const pt = $('#psTime'); if (pt) { pt.textContent = '0:' + (sec < 10 ? '0' : '') + sec; pt.classList.toggle('hot', sec <= 10); }
      if (sec !== lastSec) {
        lastSec = sec;
        K.Music.setIntensity(sec <= 10 && G.phase === 'pick' ? 1 : 0);
        if (sec <= 10 && sec > 0 && G.phase === 'pick') K.Sfx.play(sec <= 5 ? 'tick' : 'hb');
        if (sec === 10 && G.phase === 'pick' && G.myPick == null && P(G.me) && P(G.me).alive) say(t('sayTen'), ['ten']);
      }
      if (r <= 0 || G.phase !== 'pick') stopCountdown();
    };
    tick();
    G.cd = setInterval(tick, 100);
  }
  function stopCountdown() { clearInterval(G.cd); G.cd = null; if (K.Music.setIntensity) K.Music.setIntensity(0); }

  /* ---------- event handlers ---------- */
  async function onStart(d, ok) {
    G.players = {};
    d.players.forEach(function (p) { G.players[p.id] = Object.assign({}, p, { wasBot: p.bot, outShown: false }); });
    G.hpMax = d.hp; G.timer = d.timer; G.round = 0; G.history = []; G.last = null; G.stats = { won: 0, close: null };
    G.alive = d.players.map(function (p) { return p.id; });
    G.start = d.players.length; G.crown = null;
    const me = P(G.me);
    const gs = $('#scr-game');
    gs.classList.remove('dead', 'lowered', 'killed');
    glass(false); $('#sight').className = '';
    gs.classList.add('dark');
    $('#flash').classList.remove('hold');
    if (me) {
      gs.style.setProperty('--hand', K.skinOf(me.avatar));
      gs.style.setProperty('--sleeve', K.outfitOf(me.avatar));
      gs.style.setProperty('--cuff', K.accentOf(me.avatar));
    }
    Scene().build(others().map(function (id) { return P(id); }), P(G.me));
    others().forEach(function (id) { placard(id, null, false); Scene().expr(id, 'neutral'); });
    updateHead(); monitorEmblem(); renderPad('idle');
    $('#capT').textContent = '';
    K.Music.set('game');
    await sleep(600); if (!ok()) return;
    const ids = others();
    for (let i = 0; i < ids.length; i++) {
      Scene().spot(ids[i], 'on'); K.Sfx.play('spot'); placard(ids[i], null, true);
      Scene().expr(ids[i], P(ids[i]).bot ? pick(['smirk', 'neutral', 'smile']) : 'smile');
      await sleep(420); if (!ok()) return;
    }
    gs.classList.remove('dark');
    flashScreen('white'); K.Sfx.play('slam'); shake();
    banner('slam', '', t('gameStart'), 1900);
    Scene().holo(String(G.start), t('players').toUpperCase(), 'gold');
    say(G.start === 5 ? t('sayStart') : t('sayStartN', G.start), [G.start === 5 ? 'start' : 'start_' + G.start]);
    const pw = $('#padWrap'); pw.classList.remove('enter'); void pw.offsetWidth; pw.classList.add('enter');
    await sleep(1900); if (!ok()) return;
    G.s.send('ready');
  }

  async function onRound(d, ok, at) {
    G.round = d.round; G.alive = d.alive; G.locked = {}; G.entry = ''; G.myPick = null;
    G.crown = d.crown || null;
    G.phase = 'pick';
    Scene().resetTablets();
    Scene().crown(G.crown);
    aliveOthers().forEach(function (id) { Scene().led(id, 'think'); Scene().expr(id, 'think'); });
    updateHead();
    K.Sfx.play('banner');
    banner('sweep', t('round'), (d.round < 10 ? '0' : '') + d.round, 1700);
    Scene().holo('?', t('round').toUpperCase() + ' ' + d.round, '');
    monitorPick();
    const meAlive = P(G.me) && P(G.me).alive;
    renderPad(meAlive ? 'pick' : 'spectate');
    startCountdown(d.timeMs * speed() - (performance.now() - at));
    let line = t('sayRound', d.round), keys = [d.round <= 30 ? 'round_' + d.round : 'round_x'];
    if (G.crown) {
      line += ' ' + (G.crown === G.me ? t('sayCrownYou') : t('sayCrown', nm(G.crown)));
      keys = keys.concat(G.crown === G.me ? ['crown_you'] : vName(G.crown).concat(['crown_sfx']));
    }
    say(line, keys);
    void ok;
  }

  function onLocked(d) {
    G.locked[d.id] = true;
    const lk = lkEl(d.id); if (lk) lk.classList.add('on');
    if (d.id === G.me) return;
    Scene().led(d.id, 'lock'); Scene().tap(d.id); Scene().gaze(d.id, 'center');
    Scene().expr(d.id, pick(['smirk', 'neutral', 'smile']));
    K.Sfx.play('botlock');
    taunt(d.id, 'lock', 0.3);
  }

  function onAutopick(d) {
    if (d.id !== G.me || G.myPick != null) return;
    G.myPick = d.value;
    renderPad('wait');
    say(t('sayAuto', d.value), ['auto']);
  }

  async function onReveal(d, ok) {
    G.phase = 'reveal';
    stopCountdown();
    const gs = $('#scr-game');
    gs.classList.add('lowered');
    if (G.myPick == null && d.picks.some(function (p) { return p.id === G.me; })) G.myPick = d.picks.filter(function (p) { return p.id === G.me; })[0].pick;
    aliveOthers().forEach(function (id) { Scene().gaze(id, 'up'); Scene().expr(id, 'neutral'); });
    K.Sfx.play('sting');
    banner('sweep', '', t('reveal'), 1500);
    monitorReveal();
    const lv = levels(d.picks);
    await sleep(700); if (!ok()) return;
    setStep(lv);
    say(t('sayReveal'), ['reveal']);
    await sleep(500); if (!ok()) return;
    const order = Scene().seats.map(function (s) { return s.id; }).concat([G.me]).filter(function (id) { return d.picks.some(function (p) { return p.id === id; }); });
    for (let i = 0; i < order.length; i++) {
      const id = order[i], v = d.picks.filter(function (p) { return p.id === id; })[0].pick;
      if (id !== G.me) Scene().flip(id, v);
      setStep(lv);
      placeChip(id, v, lv[id]); K.Sfx.play('chip');
      await sleep(id === G.me ? 380 : 620); if (!ok()) return;
    }
    const res = d.res;
    await sleep(400); if (!ok()) return;
    showAvg(res.avg); K.Sfx.play('avg');
    Scene().holo(fmt(res.avg), t('average').toUpperCase(), '');
    await say(t('sayAvg', spk(res.avg)), ['avg_pre'].concat(vNum(res.avg))); if (!ok()) return;
    showTgt(res.target); K.Sfx.play('target'); formula(res.avg, res.target);
    Scene().holo(fmt(res.target), t('target').toUpperCase(), 'red');
    await say(t('sayTgt', spk(res.target)), ['tgt_pre'].concat(vNum(res.target))); if (!ok()) return;
    if (res.voided.length) {
      markVoid(res.voided); K.Sfx.play('void');
      res.voided.forEach(function (id) { if (id !== G.me) Scene().expr(id, 'angry'); });
      await say(t('sayVoid'), ['void']); if (!ok()) return;
    }

    /* verdict */
    markVerdict(res);
    const winLine = function (id) { return id === G.me ? t('sayWinYou') : t('sayWin', nm(id)); };
    let line, lineKeys;
    if (res.noWinner) { line = t('sayNone'); lineKeys = ['none']; }
    else if (res.special === 'zeroHundred') { line = t('say100') + ' ' + winLine(res.winners[0]); lineKeys = ['hundred'].concat(vWin(res.winners[0])); }
    else if (res.winners.length > 1) { line = t('sayTie', joinN(res.winners.map(nm))); lineKeys = vNames(res.winners).concat(['tie_sfx']); }
    else { line = winLine(res.winners[0]) + (res.bullseye ? ' ' + t('sayBull') : ''); lineKeys = vWin(res.winners[0]).concat(res.bullseye ? ['bull'] : []); }
    res.winners.forEach(function (id) {
      burstAt(chipEl(id), { n: 40, cols: ['#FFC54A', '#FFE08A', '#FFFFFF'], speed: 5, up: 1.5 });
      if (id !== G.me) { Scene().expr(id, P(id).type === 'gambler' ? 'grin' : 'smile'); Scene().spot(id, 'gold'); taunt(id, 'win'); }
    });
    if (res.winners.indexOf(G.me) >= 0) { K.Sfx.play('win'); G.stats.won++; }
    else if (res.winners.length) K.Sfx.play('shine');
    if (G.myPick != null && d.picks.some(function (p) { return p.id === G.me; })) {
      const miss = Math.abs(G.myPick - res.target);
      if (G.stats.close === null || miss < G.stats.close) G.stats.close = miss;
    }
    Object.keys(d.hp).forEach(function (id) { if (P(id)) P(id).hp = d.hp[id]; });
    let hurtTaunt = false;
    d.picks.forEach(function (p, i) {
      const dl = res.deltas[p.id];
      if (p.id !== G.me && dl < 0) Scene().expr(p.id, res.bullseye ? 'shock' : 'frown');
      if (dl >= 0) return;
      setTimeout(function () {
        K.Sfx.play('hurt');
        if (p.id === G.me) {
          flashScreen(); const w = $('#padWrap'); w.classList.remove('jolt', 'enter'); void w.offsetWidth; w.classList.add('jolt');
          burstAt($('#psPips'), { n: 22, cols: ['#E8344E', '#FFFFFF', '#FF8A98'], speed: 4, size: 5 });
        } else {
          Scene().hurt(p.id);
          burstAt(Scene().el('pl-', p.id), { n: 18, cols: ['#E8344E', '#FFFFFF'], speed: 3.5, size: 4.5 });
          if (!hurtTaunt && Math.random() < 0.35) { hurtTaunt = true; taunt(p.id, 'hurt'); }
        }
      }, (300 + i * 160) * speed());
    });
    others().forEach(function (id) { if (d.before[id] !== undefined) placard(id, d.before[id], true); });
    const pp = $('#psPips');
    if (pp && d.before[G.me] !== undefined) {
      let h = '';
      for (let i = 0; i < G.hpMax; i++) h += '<i class="pip' + (i < d.hp[G.me] ? '' : (i < d.before[G.me] ? ' drain' : ' off')) + '"></i>';
      pp.innerHTML = h;
    }
    G.history.push({ avg: res.avg, target: res.target });
    G.last = { picks: d.picks, res: res };
    if (res.winners.length === 1) Scene().holo(fmt(res.target), nm(res.winners[0]).toUpperCase(), 'gold');
    await say(line, lineKeys); if (!ok()) return;
    const extra = res.extra || {};
    const outl = Object.keys(extra).filter(function (id) { return extra[id] === 'outlier'; });
    const lowb = Object.keys(extra).filter(function (id) { return extra[id] === 'lowball'; });
    Object.keys(extra).forEach(function (id) { const c = chipEl(id); if (c) c.classList.add('extra'); });
    if (outl.length) { K.Sfx.play('hurt'); await say(t('sayOutlier', joinN(outl.map(nm))), vNames(outl).concat(['outlier_sfx'])); if (!ok()) return; }
    if (lowb.length) { K.Sfx.play('hurt'); await say(t('sayLowball', joinN(lowb.map(nm))), vNames(lowb).concat(['lowball_sfx'])); if (!ok()) return; }
    await sleep(500); if (!ok()) return;
    aliveOthers().forEach(function (id) { Scene().spot(id, 'on'); });

    /* eliminations */
    for (let i = 0; i < d.eliminated.length; i++) {
      const id = d.eliminated[i];
      P(id).alive = false;
      if (id === G.me) await eliminateMe(ok); else await eliminateOther(id, ok);
      if (!ok()) return;
    }
    G.alive = G.alive.filter(function (id) { return P(id).alive; });

    /* new rules */
    for (let i = 0; i < d.newRules.length; i++) { await announceRule(d.newRules[i], i === 0, ok); if (!ok()) return; }

    if (d.over) { await sleep(400); if (ok()) G.s.send('ready'); return; }
    gs.classList.remove('lowered');
    if (d.eliminated.length || d.newRules.length) restoreGraph();
    aliveOthers().forEach(function (id) { Scene().expr(id, 'neutral'); Scene().gaze(id, 'center'); });
    updateHead();
    if (P(G.me).alive) {
      G.phase = 'result';
      renderPad('result', { res: res });
      await new Promise(function (r) { G.nextResolve = function () { G.nextResolve = null; r(); }; });
      if (!ok()) return;
      if (G.s.mode === 'online') renderPad('waitPlayers');
      G.s.send('ready');
    } else {
      G.phase = 'spectate';
      renderPad('spectate');
      await sleep(1500); if (ok()) G.s.send('ready');
    }
  }

  async function eliminateOther(id, ok) {
    Scene().expr(id, 'shock'); Scene().spot(id, 'red'); K.Sfx.play('alarm');
    aliveOthers().forEach(function (o) { if (o !== id) { Scene().expr(o, 'shock'); Scene().lookAt(o, id); } });
    monitorElim(id);
    Scene().holo('✕', nm(id).toUpperCase(), 'red');
    await sleep(700); if (!ok()) return;
    $('#scr-game').classList.add('exec');
    Scene().focus(id);
    await sleep(500); if (!ok()) return;
    await Scene().execute(id, gore(), function () {
      flashScreen('white'); shake();
      if (gore()) setTimeout(function () { flashScreen(); }, 120);
    });
    if (!ok()) return;
    Scene().focus(null);
    $('#scr-game').classList.remove('exec');
    Scene().spot(id, 'off');
    P(id).outShown = true; placard(id, null, true);
    await say(t('sayElim', P(id).name), vName(id).concat(['elim_sfx'])); if (!ok()) return;
    aliveOthers().forEach(function (o) { Scene().expr(o, o === id ? 'neutral' : 'frown'); Scene().gaze(o, 'center'); });
  }
  async function eliminateMe(ok) {
    const gs = $('#scr-game'), sc = Scene();
    monitorElim(G.me); K.Sfx.play('alarm');
    aliveOthers().forEach(function (o) { sc.expr(o, 'shock'); sc.lookAt(o, G.me); });
    // 1. first person: the red dot crawls onto you
    const sight = $('#sight');
    sight.className = ''; void sight.offsetWidth; sight.className = 'on';
    K.Sfx.play('servo');
    await sleep(1100); if (!ok()) return;
    sight.className = '';
    if (!sc.cineStart()) return eliminateMeFirstPerson(ok);

    // 2. cut outside: you, in your chair, seen from across the table
    let skipped = false;
    const skipNow = function (e) { if (e && e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Escape') return; skipped = true; };
    const cs = function (ms) { return skipped ? Promise.resolve() : sleep(ms); };
    setTimeout(function () { document.addEventListener('pointerdown', skipNow, true); document.addEventListener('keydown', skipNow, true); }, 300);
    const done = function () { document.removeEventListener('pointerdown', skipNow, true); document.removeEventListener('keydown', skipNow, true); };
    flashScreen('white');
    gs.classList.add('cine');
    $('#cineTitle').classList.remove('show');
    $('#cineName').textContent = P(G.me).name;
    sc.spot(G.me, 'red'); sc.expr(G.me, 'shock'); sc.gaze(G.me, 'up');
    sc.cineShot([0.7, -0.3, -2.45], [0, 0.32, -0.2], 50, 0);
    sc.cineShot([0.45, -0.32, -2.1], [0, 0.26, -0.15], 46, 2600, 'inout');
    let shotAt = 0;
    await sc.execute(G.me, gore(), function () {
      // 3. the shot, in slow motion
      shotAt = performance.now();
      if (!skipped) { sc.slowmo(0.22); sc.cineShot([0.2, -0.2, -1.2], [0, 0, 0], 30, 260, 'out'); }
      flashScreen('white'); K.Sfx.play('hb');
      if (gore()) setTimeout(function () { flashScreen(); }, 140);
    }, {
      out: 0.6, up: 0.72, aim: 1300, after: 2600, slow: true,
      skipped: function () { return skipped; },
      onAim: function () { if (!skipped) sc.cineShot([0.3, -0.26, -1.55], [0, 0.06, 0], 36, 1300, 'in'); K.Sfx.play('hb'); }
    });
    if (!ok()) { done(); sc.cineEnd(); return; }
    // 4. back to real time: the camera rises and circles while the table reacts
    sc.slowmo(1);
    aliveOthers().forEach(function (o) { sc.expr(o, P(o).bot ? 'grin' : 'shock'); });
    gs.classList.add('cine-grey');
    sc.cineShot([0.95, 1.05, -2.55], [0, -0.42, -0.55], 52, skipped ? 1 : 2600, 'inout');
    $('#cineTitle').classList.add('show');
    K.Sfx.play('boom');
    await say(t('sayElimYou'), ['elim_you']);
    await cs(900);
    done();
    if (!ok()) { sc.cineEnd(); return; }
    // 5. fade back to the table
    gs.classList.add('cine-out');
    await sleep(450);
    sc.cineEnd(); sc.spot(G.me, 'off');
    gs.classList.remove('cine', 'cine-grey', 'cine-out');
    $('#cineTitle').classList.remove('show');
    gs.classList.add('dead');
    if (!ok()) return;
    if (!(G.s.mode === 'online' && aliveOthers().length > 1)) {
      gs.classList.add('killed'); glass(true); Scene().youDie();
    } else Scene().reviveCam();
  }
  /* fallback when 3D is not available: the old first-person version */
  async function eliminateMeFirstPerson(ok) {
    K.Sfx.play('laser'); K.Sfx.play('hb');
    await sleep(900); if (!ok()) return;
    K.Sfx.play('shot');
    flashScreen('white'); shake();
    glass(true);
    setTimeout(function () { const f = $('#flash'); f.classList.remove('white', 'go'); f.classList.add('hold'); }, 260);
    $('#scr-game').classList.add('dead', 'killed');
    Scene().youDie();
    if (gore()) K.FX.burst(window.innerWidth / 2, window.innerHeight * 0.45, { n: 90, cols: ['#B3122A', '#8E0E1A', '#E8344E'], speed: 9, g: 0.3, size: 4, shape: 'sq' });
    await sleep(1100); if (!ok()) return;
    aliveOthers().forEach(function (o) { Scene().expr(o, P(o).bot ? 'grin' : 'shock'); });
    await say(t('sayElimYou'), ['elim_you']); if (!ok()) return;
    if (G.s.mode === 'online' && aliveOthers().length > 1) {
      await sleep(1200); if (!ok()) return;
      $('#scr-game').classList.remove('killed'); glass(false); $('#flash').classList.remove('hold'); Scene().reviveCam();
    }
  }
  async function announceRule(k, intro, ok) {
    const r = K.RULES.filter(function (x) { return x.k === k; })[0], n = K.RULES.indexOf(r) + 1;
    K.Sfx.play('rule'); updateHead(k);
    aliveOthers().forEach(function (id) { Scene().gaze(id, 'up'); Scene().expr(id, 'neutral'); });
    const ov = $('#ovRule');
    $('#rcN').textContent = t('ruleN', n);
    $('#rcTitle').textContent = r.t[K.lang];
    const txt = $('#rcText'); txt.textContent = '';
    ov.hidden = false;
    const full = r.x[K.lang];
    let i = 0;
    const typer = setInterval(function () { i += 2; txt.textContent = full.slice(0, i); if (i >= full.length) clearInterval(typer); }, 18);
    const clicked = new Promise(function (res) { G.ruleResolve = res; });
    const spoken = (async function () {
      await sleep(900);
      if (intro && ok()) await say(t('sayNewRule'), ['newrule']);
      if (ok()) await say(t('ruleN', n) + t('dot') + r.t[K.lang] + t('dot') + full, ['rule_' + k]);
      await sleep(G.s.mode === 'online' ? 1500 : 6000);
    })();
    await Promise.race([clicked, spoken]);
    clearInterval(typer); txt.textContent = full;
    G.ruleResolve = null;
    K.Voice.stop();
    ov.hidden = true;
  }

  async function onOver(d, ok) {
    G.phase = 'over';
    stopCountdown();
    K.Music.set(null);
    const iWon = d.winner === G.me;
    const winnerName = d.winner ? nm(d.winner) : null;
    $('#scr-game').classList.remove('lowered');
    Scene().crown(d.winner);
    if (d.winner) Scene().holo('♛', winnerName.toUpperCase(), 'gold');
    if (iWon) {
      monitorEnd('win', t('gameClear')); K.Sfx.play('clear');
      banner('slam', '', t('gameClear'), 2400);
      K.FX.confetti($('#mon').getBoundingClientRect(), true);
      await say(t('sayClear'), ['clear']);
    } else {
      monitorEnd('lose', d.winner ? t('winsMatch', winnerName) : t('noSurvivor'));
      K.Sfx.play('over');
      if (d.winner) { Scene().spot(d.winner, 'gold'); Scene().expr(d.winner, 'grin'); }
      await say(d.winner ? t('sayWinner', winnerName) : t('sayOver'), d.winner ? ['over'].concat(vName(d.winner), ['winner_sfx']) : ['over']);
    }
    if (!ok()) return;
    await sleep(700); if (!ok()) return;
    K.UI.showEnd({ winner: d.winner, standings: d.standings, rounds: d.rounds, me: G.me, stats: G.stats, mode: G.s.mode });
  }


  /* the connection dropped for a while (phone in the background) and came back: rebuild the table as it is now */
  async function onResync(d, ok) {
    G.players = {};
    d.players.forEach(function (p) { G.players[p.id] = Object.assign({}, p, { wasBot: p.bot && !p.connected ? false : p.bot, outShown: !p.alive }); });
    G.hpMax = d.hp; G.timer = d.timer; G.round = d.round; G.history = []; G.last = null;
    G.stats = G.stats || { won: 0, close: null };
    G.alive = d.alive.slice(); G.start = d.players.length; G.crown = d.crown || null;
    G.locked = {}; (d.locked || []).forEach(function (id) { G.locked[id] = true; });
    G.myPick = d.mine == null ? null : d.mine; G.entry = '';
    const gs = $('#scr-game'), me = P(G.me);
    gs.classList.remove('dark', 'lowered', 'killed', 'exec', 'cine', 'cine-grey', 'cine-out', 'dead');
    $('#ovRule').hidden = true; $('#banner').innerHTML = ''; $('#formula').classList.remove('show'); $('#beams').innerHTML = '';
    glass(false); $('#sight').className = ''; $('#flash').classList.remove('hold', 'white', 'go');
    if (!me) return;
    gs.style.setProperty('--hand', K.skinOf(me.avatar));
    gs.style.setProperty('--sleeve', K.outfitOf(me.avatar));
    gs.style.setProperty('--cuff', K.accentOf(me.avatar));
    Scene().build(others().map(function (id) { return P(id); }), P(G.me));
    others().forEach(function (id) {
      const p = P(id);
      if (!p.alive) Scene().killQuiet(id);
      else { Scene().spot(id, 'on'); Scene().expr(id, 'neutral'); }
      placard(id, null, true);
    });
    Scene().crown(G.crown);
    updateHead();
    K.Music.set('game');
    if (!me.alive) { gs.classList.add('dead'); Scene().killQuiet(G.me); Scene().reviveCam(); }
    if (d.state === 'pick') {
      G.phase = 'pick';
      monitorPick();
      Object.keys(G.locked).forEach(function (id) {
        const lk = lkEl(id); if (lk) lk.classList.add('on');
        if (id !== G.me && P(id) && P(id).alive) Scene().led(id, 'lock');
      });
      aliveOthers().forEach(function (id) { if (!G.locked[id]) { Scene().led(id, 'think'); Scene().expr(id, 'think'); } });
      if (!me.alive) renderPad('spectate');
      else if (G.myPick != null) renderPad('wait');
      else renderPad('pick');
      startCountdown(d.remainMs * speed());
    } else {
      // between rounds: show the table and tell the server we are ready for the next step
      G.phase = 'result';
      monitorEmblem();
      renderPad(me.alive ? 'waitPlayers' : 'spectate');
      await sleep(400); if (!ok()) return;
      G.s.send('ready');
    }
    banner('sweep', '', t('reconnected'), 1500);
  }

  function onPlayer(d) {
    const p = P(d.id); if (!p) return;
    p.connected = d.connected; p.bot = d.bot; p.type = p.type || 'analyst';
    if (Scene().has(d.id)) placard(d.id, null, true);
  }

  /* ---------- public API ---------- */
  const Game = {
    begin: function (session) {
      G.token++;
      G.s = session; G.me = session.me; G.q = Promise.resolve(); G.phase = 'idle'; G.paused = false;
      K.Voice.stop();
      this.ambient();
    },
    event: function (type, data) {
      if (type === 'resync') { G.token++; stopCountdown(); if (G.nextResolve) G.nextResolve(); if (G.ruleResolve) G.ruleResolve(); K.Voice.stop(); G.q = Promise.resolve(); }
      const tok = G.token, ok = live(tok), at = performance.now();
      if (type === 'locked') { G.q = G.q.then(function () { if (ok()) onLocked(data); }); return; }
      const h = { start: onStart, round: onRound, autopick: onAutopick, reveal: onReveal, over: onOver, player: onPlayer, resync: onResync }[type];
      if (!h) return;
      G.q = G.q.then(function () { if (ok()) return h(data, ok, at); }).catch(function (e) { console.error(e); });
    },
    stop: function (keepRoom) {
      G.token++; stopCountdown(); K.Voice.stop(); G.paused = false; G.phase = 'idle';
      if (G.nextResolve) G.nextResolve(); if (G.ruleResolve) G.ruleResolve();
      $('#ovRule').hidden = true; $('#banner').innerHTML = ''; $('#flash').classList.remove('hold');
      $('#formula').classList.remove('show'); $('#beams').innerHTML = '';
      glass(false); $('#sight').className = ''; $('#scr-game').classList.remove('killed', 'exec', 'cine', 'cine-grey', 'cine-out'); $('#flash').classList.remove('white', 'go');
      $('#cineTitle').classList.remove('show'); if (K.Scene && K.Scene.cineEnd) K.Scene.cineEnd();
      clearInterval(G.idleIv);
      K.Music.set(null);
      if (G.s) { const s = G.s; G.s = null; s.leave(keepRoom); }
    },
    pause: function () { if (!G.s) return; if (G.s.mode === 'solo') { G.paused = true; G.s.pause(); } K.Voice.stop(); },
    resume: function () { if (!G.s) return; G.paused = false; if (G.s.mode === 'solo') G.s.resume(); },
    active: function () { return !!G.s && G.phase !== 'over'; },
    mode: function () { return G.s ? G.s.mode : null; },
    key: function (e) {
      if (!G.s) return false;
      if (canType()) {
        if (/^[0-9]$/.test(e.key)) { pressKey(e.key); keyIn(e.key); return true; }
        if (e.key === 'Backspace') { pressKey('⌫'); keyBack(); return true; }
        if (e.key === 'Enter') { lockIn(); return true; }
      }
      if (e.key === 'Enter' && G.nextResolve) { G.nextResolve(); return true; }
      if (e.key === ' ') { skipLine(); return true; }
      return false;
    },
    skip: skipLine,
    /* chat and emotes shown above a player's head at the table */
    say: function (id, text) {
      if (!G.s || !K.Scene.has(id)) return false;
      K.Scene.bubble(id, text); return true;
    },
    hasPlayer: function (id) { return !!G.s && !!G.players[id]; },
    ruleContinue: function () { if (G.ruleResolve) G.ruleResolve(); },
    ambient: function () {
      clearInterval(G.idleIv);
      G.idleIv = setInterval(function () {
        if (!G.s) return;
        Scene().seats.forEach(function (s) {
          const p = P(s.id); if (!p || !p.alive) return;
          if (Math.random() < 0.3) Scene().blink(s.id);
          if (G.phase === 'pick' && !G.locked[s.id] && Math.random() < 0.25) Scene().gaze(s.id, pick(['left', 'right', 'center', 'up', 'down']));
        });
      }, 900);
    },
    _state: G,
    _elimMe: function () { const tk = G.token; P(G.me).alive = false; return eliminateMe(function () { return G.token === tk; }); }
  };
  K.Game = Game;
})();
