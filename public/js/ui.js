/* King of Diamonds: menus and screens (main menu, solo setup, avatar, rulebook, settings, rooms, end). */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const Pre = window.KODPresets;
  const $ = function (s) { return document.querySelector(s); };
  const $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  const t = function () { return K.t.apply(null, arguments); };
  const SKEY = 'kod-settings-v1', PKEY = 'kod-profile-v1', RKEY = 'kod-record-v1';

  K.settings = { lang: 'en', voice: true, music: true, sfx: true, diff: 'normal', hp: 6, timer: 40, size: 5, violence: 'ruthless' };
  K.profile = { name: '', avatar: Pre.defaultAvatar() };
  K.record = { played: 0, won: 0 };
  try { Object.assign(K.settings, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) {}
  try { const p = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (p) K.profile = { name: Pre.cleanName(p.name), avatar: Pre.cleanAvatar(p.avatar) }; } catch (e) {}
  try { Object.assign(K.record, JSON.parse(localStorage.getItem(RKEY) || '{}')); } catch (e) {}
  if (!K.profile.name) K.profile.name = 'Player';
  K.lang = K.settings.lang === 'hi' ? 'hi' : 'en';
  const saveS = function () { try { localStorage.setItem(SKEY, JSON.stringify(K.settings)); } catch (e) {} };
  const saveP = function () { try { localStorage.setItem(PKEY, JSON.stringify(K.profile)); } catch (e) {} };
  const saveR = function () { try { localStorage.setItem(RKEY, JSON.stringify(K.record)); } catch (e) {} };

  let toastT = null;
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 4200); }
  function copy(text, btn, label) {
    const done = function () { if (btn) { btn.textContent = t('copied'); setTimeout(function () { btn.textContent = t(label); }, 1600); } };
    try { navigator.clipboard.writeText(text).then(done, function () { toast(text); }); } catch (e) { toast(text); }
  }
  function seg(el, items, cur, onPick) {
    el.innerHTML = items.map(function (it) {
      return '<button type="button" data-v="' + it.v + '" aria-pressed="' + (String(it.v) === String(cur)) + '">' + it.label + '</button>';
    }).join('');
    el.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { K.Sfx.play('click'); onPick(b.dataset.v); });
    });
  }

  /* ---------- navigation with a diamond wipe ---------- */
  const UI = {
    cur: null, from: null, soloBots: null,
    go: function (name, opts) {
      opts = opts || {};
      const self = this;
      const swap = function () {
        $$('.screen').forEach(function (s) { s.classList.remove('active'); });
        $('#scr-' + name).classList.add('active');
        self.cur = name;
        if (name === 'game') { K.BG.stop(); K.Scene.attractStop(); K.Scene.start(); }
        else {
          // the landing page shows the live 3D card room; other screens use the light 2D background
          if (name === 'menu' && !window.__KOD_NORENDER && K.Scene.attract($('#landHero'))) K.BG.stop();
          else { K.BG.start(); K.Scene.stop(); }
          if (K.Sfx.ctx && !(K.Game.active())) K.Music.set('menu');
        }
        if (self['render_' + name]) self['render_' + name]();
        const f = $('#scr-' + name).querySelector('.back, .mi, input');
        if (f && name !== 'game' && !opts.noFocus) { try { f.focus({ preventScroll: true }); } catch (e) {} }
      };
      if (opts.instant || K.FAST) { swap(); return; }
      const w = $('#wipe');
      w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
      K.Sfx.play('wipe');
      setTimeout(swap, 320);
    },
    back: function () {
      if (this.cur === 'queue') { this.leaveQueue(); return; }
      if (this.from === 'game') { this.from = null; this.go('game', { instant: true }); this.openPause(); return; }
      this.go('menu');
    },

    /* ---------- main menu ---------- */
    render_menu: function () {
      $('#meAv').innerHTML = K.avatarHead(K.profile.avatar);
      $('#meAv').style.setProperty('--c', K.accentOf(K.profile.avatar));
      $('#meName').textContent = K.profile.name;
      syncTools();
      this.liveCount();
      $('#landRules').innerHTML = K.RULES.map(function (r, i) {
        return '<div class="lrule' + (r.big ? ' big' : '') + '"><span class="lr-n">' + (i + 1) + '</span><span class="lr-at">' + (r.big ? t('atBig', r.at) : r.at ? t('atN', r.at) : t('always')) + '</span><h3>' + r.t[K.lang] + '</h3><p>' + r.x[K.lang] + '</p></div>';
      }).join('');
    },
    /* "12 online" on the Quick match button (also wakes a sleeping free server early) */
    liveCount: function () {
      const el = $('#miLive');
      if (!el || !K.Net.available() || !window.fetch) return;
      const url = (K.Net.server() || '') + '/stats';
      const ctl = window.AbortController ? new AbortController() : null;
      const to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
      fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.json(); }).then(function (d) {
        clearTimeout(to);
        if (d && d.online > 0) { el.textContent = t('qOnline', d.online); el.hidden = false; } else el.hidden = true;
      }).catch(function () { clearTimeout(to); el.hidden = true; });
    },

    /* ---------- quick match ---------- */
    quick: false,
    quickMatch: function () {
      const self = this;
      if (!K.Net.available()) { toast(t('qOffline')); return; }
      this.connect().then(function () { return K.Net.call('quick:join'); }).then(function (r) {
        if (!r || !r.ok) { toast(t('qOffline')); return; }
        self.quick = true; self.qStart = Date.now(); self.qOfferAt = 0; self.qKept = 0; self.qSeen = {}; self.qN = 0;
        if (self.cur !== 'queue') self.go('queue');
        else self.render_queue();
      }).catch(function () { toast(t('qOffline')); });
    },
    leaveQueue: function () {
      clearInterval(this.qIv); this.qIv = null;
      this.quick = false;
      K.VC.closeAll(); K.Net.leave();
      this.go('menu');
    },
    render_queue: function () {
      const st = K.Net.room, self = this;
      if (!st || !st.public) return;
      if (st.offerAt) this.qOfferAt = Date.now() + (st.offerAt - st.now);
      const humans = st.members.filter(function (m) { return !m.bot; }), need = st.need || 5;
      let seats = '';
      for (let i = 0; i < need; i++) {
        const m = humans[i], ang = i / need * Math.PI * 2 - Math.PI / 2;
        const pos = 'left:' + (50 + Math.cos(ang) * 41).toFixed(1) + '%;top:' + (50 + Math.sin(ang) * 41).toFixed(1) + '%';
        const fresh = m && !self.qSeen[m.id]; if (m) self.qSeen[m.id] = 1;
        seats += m ? '<div class="q-seat in' + (fresh ? ' new' : '') + (m.id === K.Net.me ? ' me' : '') + '" style="' + pos + ';--c:' + K.accentOf(m.avatar) + '"><div class="q-av">' + K.avatarHead(m.avatar) + '</div><b>' + (m.id === K.Net.me ? t('you') : m.name) + '</b></div>'
                   : '<div class="q-seat" style="' + pos + '"><div class="q-av"><i>?</i></div><b>' + t('qWaiting') + '</b></div>';
      }
      $('#qSeats').innerHTML = seats;
      const prev = this.qN || 0; this.qN = humans.length;
      if (humans.length > prev && prev) K.Sfx.play('chip');
      $('#qCount').textContent = t('qCount', humans.length, need);
      $('#qOnline').textContent = st.online ? t('qOnline', st.online) : '';
      if (!this.qIv) this.qIv = setInterval(function () { self.qTick(); }, 250);
      this.qTick();
    },
    qTick: function () {
      if (this.cur !== 'queue') { clearInterval(this.qIv); this.qIv = null; return; }
      const sec = Math.floor((Date.now() - this.qStart) / 1000);
      $('#qTime').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      const show = this.qOfferAt && Date.now() >= Math.max(this.qOfferAt, this.qKept || 0);
      const off = $('#qOffer');
      if (show && off.hidden) { off.hidden = false; K.Sfx.play('shine'); }
      else if (!show && !off.hidden) off.hidden = true;
    },

    /* ---------- solo ---------- */
    render_solo: function () {
      const size = K.settings.size || 5;
      if (!this.soloBots || this.soloBots.length !== size - 1) this.soloBots = Pre.pickBots(size - 1, [K.profile.name]);
      $('#soloRivals').innerHTML = this.soloBots.map(function (b) {
        const c = K.accentOf(b.avatar);
        return '<div class="rv" style="--c:' + c + '"><div class="rv-av">' + K.avatarBust(b.avatar, 'smirk') + '</div><b>' + b.name + '</b><small>' + t('type' + b.type.charAt(0).toUpperCase() + b.type.slice(1)) + '</small></div>';
      }).join('');
      const S = K.settings, self = this;
      seg($('#segSize'), [5, 6, 7, 8].map(function (n) { return { v: n, label: (n === 5 ? t('classic') + ' ' : '') + n }; }), S.size || 5, function (v) { S.size = Number(v); saveS(); self.render_solo(); });
      $('#sizeNote').hidden = (S.size || 5) <= 5;
      seg($('#segDiff'), [{ v: 'easy', label: t('easy') }, { v: 'normal', label: t('normal') }, { v: 'hard', label: t('hard') }], S.diff, function (v) { S.diff = v; saveS(); self.render_solo(); });
      seg($('#segLen'), [{ v: 4, label: t('quick') + '<i>4</i>' }, { v: 6, label: t('standard') + '<i>6</i>' }, { v: 10, label: t('long') + '<i>10</i>' }], S.hp, function (v) { S.hp = Number(v); saveS(); self.render_solo(); });
      seg($('#segTime'), [20, 30, 40, 60].map(function (n) { return { v: n, label: n + t('sec') }; }), S.timer, function (v) { S.timer = Number(v); saveS(); self.render_solo(); });
    },
    startSolo: function () {
      const size = K.settings.size || 5;
      const bots = this.soloBots && this.soloBots.length === size - 1 ? this.soloBots : Pre.pickBots(size - 1, [K.profile.name]);
      this.soloBots = null;
      const players = [{ id: 'me', name: K.profile.name, avatar: K.profile.avatar, bot: false }].concat(bots.map(function (b, i) {
        return { id: 'bot' + i, name: b.name, avatar: b.avatar, bot: true, type: b.type };
      }));
      let match = null;
      const session = {
        mode: 'solo', me: 'me',
        send: function (type, data) { if (!match) return; if (type === 'pick') match.submit('me', data.value); else if (type === 'ready') match.ready('me'); },
        pause: function () { if (match) match.pause(); },
        resume: function () { if (match) match.resume(); },
        leave: function () { if (match) match.destroy(); match = null; }
      };
      this.lastMode = 'solo';
      $('#gMic').hidden = true;
      this.go('game');
      K.Music.set('game');
      K.Game.begin(session);
      match = new window.KODEngine.Match({
        players: players, hp: K.settings.hp, timer: K.FAST ? K.settings.timer * 0.02 : K.settings.timer, difficulty: K.settings.diff,
        tickMs: K.FAST ? 5 : 50,
        emit: function (e, d) { setTimeout(function () { K.Game.event(e, d); }, 0); }
      });
      if (K.FAST) window.__KOD_MATCH = match;
      match.start();
    },

    /* ---------- avatar ---------- */
    draft: null, tab: 'presets',
    render_profile: function () {
      this.draft = JSON.parse(JSON.stringify(K.profile.avatar));
      $('#profName').value = K.profile.name;
      $('#profName').placeholder = t('namePh');
      this.drawProfile(false);
      this.renderPresets();
      this.renderCustom();
      this.setTab(this.tab);
    },
    drawProfile: function (pop) {
      const b = $('#profBust');
      b.innerHTML = K.avatarBust(this.draft, 'smile');
      if (pop) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    },
    renderPresets: function () {
      const self = this;
      $('#presetGrid').innerHTML = Pre.PRESETS.map(function (p, i) {
        const same = JSON.stringify(p.avatar) === JSON.stringify(self.draft);
        return '<button type="button" class="pre" data-i="' + i + '" aria-pressed="' + same + '" style="--c:' + K.accentOf(p.avatar) + '"><div class="rv-av">' + K.avatarHead(p.avatar) + '</div><b>' + p.name + '</b></button>';
      }).join('');
      $$('#presetGrid .pre').forEach(function (b) {
        b.addEventListener('click', function () {
          K.Sfx.play('click');
          self.draft = JSON.parse(JSON.stringify(Pre.PRESETS[Number(b.dataset.i)].avatar));
          self.commit(); self.renderPresets(); self.renderCustom();
        });
      });
    },
    renderCustom: function () {
      const self = this, O = Pre.OPT, d = this.draft;
      const named = function (key) {
        return '<div class="cgroup"><span class="lbl">' + t(key) + '</span><div class="chips">' + O[key].map(function (v) {
          const lbl = key === 'face' && v === 'long' ? t('o_long') : t('o_' + v);
          return '<button type="button" class="chipbtn" data-k="' + key + '" data-v="' + v + '" aria-pressed="' + (d[key] === v) + '">' + lbl + '</button>';
        }).join('') + '</div></div>';
      };
      const sw = function (key) {
        return '<div class="cgroup"><span class="lbl">' + t(key) + '</span><div class="chips">' + O[key].map(function (c, i) {
          return '<button type="button" class="sw" data-k="' + key + '" data-i="' + i + '" style="--s:' + c + '" aria-label="' + t(key) + ' ' + (i + 1) + '" aria-pressed="' + (d[key] === i) + '"></button>';
        }).join('') + '</div></div>';
      };
      $('#customPanel').innerHTML = sw('skin') + named('face') + named('hair') + sw('hairColor') + named('head') + sw('eyes') + named('eyewear') +
        named('facial') + named('neck') + named('outfit') + sw('outfitColor') + sw('accent');
      $$('#customPanel [data-k]').forEach(function (b) {
        b.addEventListener('click', function () {
          K.Sfx.play('key');
          if (b.dataset.i !== undefined) self.draft[b.dataset.k] = Number(b.dataset.i); else self.draft[b.dataset.k] = b.dataset.v;
          self.commit(); self.renderCustom(); self.renderPresets();
        });
      });
    },
    setTab: function (tab) {
      this.tab = tab;
      $('#tabPresets').setAttribute('aria-selected', String(tab === 'presets'));
      $('#tabCustom').setAttribute('aria-selected', String(tab === 'custom'));
      $('#presetGrid').hidden = tab !== 'presets';
      $('#customPanel').hidden = tab !== 'custom';
    },
    commit: function () {
      K.profile = { name: Pre.cleanName($('#profName').value), avatar: Pre.cleanAvatar(this.draft) };
      saveP(); this.drawProfile(true);
      if (K.Net.socket) K.Net.profile();
    },

    /* ---------- rulebook ---------- */
    render_rules: function () {
      const L = K.lang, listen = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/></svg>';
      const btn = function (id) { return '<button type="button" class="listen" data-sec="' + id + '">' + listen + t('listen') + '</button>'; };
      const how = t('how'), tips = t('tips');
      $('#rbBody').innerHTML =
        '<section class="rb-sec" id="sec-how"><div class="rb-sh"><h3>' + t('howTitle') + '</h3>' + btn('how') + '</div><ol class="steps">' +
          how.map(function (s, i) { return '<li><span><i>' + (i + 1) + '</i></span><p>' + s + '</p></li>'; }).join('') + '</ol></section>' +
        '<section class="rb-sec" id="sec-rules"><div class="rb-sh"><h3>' + t('rulesHead') + '</h3>' + btn('rules') + '</div><div class="rcards">' +
          K.RULES.map(function (r, i) { return '<div class="rc' + (r.big ? ' big' : '') + '"><span class="rn">' + (i + 1) + '</span><span class="at">' + (r.big ? t('atBig', r.at) : r.at ? t('atN', r.at) : t('always')) + '</span><h4>' + r.t[L] + '</h4><p>' + r.x[L] + '</p></div>'; }).join('') + '</div></section>' +
        '<section class="rb-sec" id="sec-ex"><div class="rb-sh"><h3>' + t('exTitle') + '</h3>' + btn('ex') + '</div><p class="example">' + t('example') + '</p></section>' +
        '<section class="rb-sec" id="sec-tips"><div class="rb-sh"><h3>' + t('tipsTitle') + '</h3>' + btn('tips') + '</div><ul class="tiplist">' + tips.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul></section>';
      const self = this;
      $$('#rbBody .listen').forEach(function (b) { b.addEventListener('click', function () { self.read([b.dataset.sec]); }); });
      $$('#rbLang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === K.lang)); });
      $('#rbAll').textContent = this.reading ? t('stop') : t('readAll');
      const note = K.Voice.note(); $('#rbNote').textContent = note; $('#rbNote').hidden = !note;
    },
    secText: function (id) {
      const L = K.lang, d = t('dot');
      if (id === 'how') return t('howTitle') + d + t('how').join(' ');
      if (id === 'rules') return K.RULES.map(function (r, i) { return t('ruleN', i + 1) + d + r.t[L] + d + r.x[L]; }).join(' ');
      if (id === 'ex') return t('exTitle') + d + t('example');
      return t('tipsTitle') + d + t('tips').join(' ');
    },
    reading: false, readStop: false,
    read: async function (ids) {
      K.Sfx.ensure();
      if (this.reading) { this.readStop = true; K.Voice.stop(); K.Ann.stop(); await new Promise(function (r) { setTimeout(r, 80); }); if (!ids) return; }
      this.reading = true; this.readStop = false; $('#rbAll').textContent = t('stop');
      const list = ids || ['how', 'rules', 'ex', 'tips'];
      for (let i = 0; i < list.length; i++) {
        if (this.readStop) break;
        const sec = $('#sec-' + list[i]);
        if (sec) { sec.classList.add('reading'); sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        const keys = list[i] === 'rules' ? K.RULES.map(function (r) { return 'rule_' + r.k; }) : ['sec_' + list[i]];
        if (K.Ann.has(keys)) await K.Ann.play(keys);
        else if (K.Voice.available(K.lang)) await K.Voice.speak(this.secText(list[i]), K.lang);
        else await new Promise(function (r) { setTimeout(r, 1200); });
        if (sec) sec.classList.remove('reading');
      }
      this.reading = false;
      $('#rbAll').textContent = t('readAll');
    },

    /* ---------- settings ---------- */
    render_settings: function () {
      const S = K.settings, self = this;
      const row = function (key, items, cur, fn) { return { key: key, items: items, cur: cur, fn: fn }; };
      const onoff = [{ v: '1', label: t('on') }, { v: '0', label: t('off') }];
      const rows = [
        row('language', [{ v: 'en', label: 'English' }, { v: 'hi', label: 'हिंदी' }], K.lang, function (v) { setLang(v); }),
        row('voice', onoff, S.voice ? '1' : '0', function (v) { S.voice = v === '1'; if (!S.voice) K.Voice.stop(); }),
        row('music', onoff, S.music ? '1' : '0', function (v) { S.music = v === '1'; K.Sfx.ensure(); K.Sfx.sync(); if (S.music && !K.Music.mode && self.cur !== 'game') K.Music.set('menu'); }),
        row('sfx', onoff, S.sfx ? '1' : '0', function (v) { S.sfx = v === '1'; K.Sfx.ensure(); K.Sfx.sync(); }),
        row('violence', [{ v: 'ruthless', label: t('ruthless') }, { v: 'clean', label: t('noBlood') }], S.violence || 'ruthless', function (v) { S.violence = v; }),
        row('voiceChat', onoff, S.voiceChat === false ? '0' : '1', function (v) { S.voiceChat = v === '1'; K.VC.setHear(S.voiceChat); })
      ];
      $('#setRows').innerHTML = rows.map(function (r) { return '<div class="opt"><span class="lbl">' + t(r.key) + '</span><div class="seg" id="set-' + r.key + '"></div></div>'; }).join('');
      rows.forEach(function (r) { seg($('#set-' + r.key), r.items, r.cur, function (v) { r.fn(v); saveS(); syncTools(); self.render_settings(); }); });
      const note = K.Voice.note(); $('#setNote').textContent = note; $('#setNote').hidden = !note;
    },

    /* ---------- rooms ---------- */
    connect: function () {
      if (!K.Net.available()) { toast(t('errOffline')); return Promise.reject(new Error('offline')); }
      if (K.Net.socket) return Promise.resolve(K.Net.socket);
      toast(t('connecting'));
      let n = 0;
      // keep the message up while a sleeping server wakes (free hosting can take up to a minute)
      const iv = setInterval(function () { n++; toast(t(n > 1 ? 'waking' : 'connecting')); }, 4000);
      return K.Net.connect().then(function (s) { clearInterval(iv); $('#toast').hidden = true; return s; }, function (e) { clearInterval(iv); toast(t('errOffline')); throw e; });
    },
    createRoom: function () {
      const self = this;
      this.quick = false;
      this.connect().then(function () { return K.Net.call('room:create'); }).then(function (r) {
        if (r && r.ok) self.go('lobby'); else toast(t('errOffline'));
      }).catch(function () {});
    },
    joinRoom: function (code) {
      const self = this;
      this.quick = false;
      code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const err = $('#joinErr');
      err.hidden = true;
      if (code.length !== 5) { err.textContent = t('errNotFound'); err.hidden = false; return; }
      this.connect().then(function () { return K.Net.call('room:join', { code: code }); }).then(function (r) {
        if (r && r.ok) { self.go('lobby'); return; }
        err.textContent = r && r.err === 'started' ? t('errStarted') : r && r.err === 'full' ? t('errFull') : t('errNotFound');
        err.hidden = false;
      }).catch(function () { err.textContent = t('errOffline'); err.hidden = false; });
    },
    render_lobby: function () {
      const st = K.Net.room; if (!st) return;
      const me = K.Net.me, host = st.hostId === me, self = this;
      $('#lobbyCode').textContent = st.code;
      let html = '';
      for (let i = 0; i < 8; i++) {
        const m = st.members[i];
        if (!m) {
          html += '<div class="seat empty"><span>' + t('emptySeat') + '</span>' + (host ? '<button type="button" class="btn sm ghost addbot" style="margin-top:10px">+ ' + t('addBot') + '</button>' : '') + '</div>';
          continue;
        }
        const c = K.accentOf(m.avatar);
        html += '<div class="seat' + (m.id === me ? ' me' : '') + '" data-id="' + m.id + '" style="--c:' + c + '"><div class="rv-av">' + K.avatarBust(m.avatar, 'smile') + '</div><b>' + m.name + '</b>' +
          (m.id === st.hostId ? '<span class="tag host">' + t('host') + '</span>' : m.bot ? '<span class="tag">' + t('bot') + '</span>' : m.id === me ? '<span class="tag you">' + t('you') + '</span>' : '<span class="tag">' + t('player') + '</span>') +
          (host && m.id !== me ? '<button type="button" class="x" data-id="' + m.id + '" aria-label="' + t('remove') + ' ' + m.name + '">×</button>' : '') + '</div>';
      }
      $('#lobbySeats').innerHTML = html;
      $$('#lobbySeats .addbot').forEach(function (b) { b.addEventListener('click', function () { K.Sfx.play('click'); K.Net.send('room:addBot'); }); });
      $$('#lobbySeats .x').forEach(function (b) { b.addEventListener('click', function () { K.Net.send('room:remove', { id: b.dataset.id }); }); });
      const s = st.settings;
      $('#lobbyOpts').innerHTML = '<div class="opt"><span class="lbl">' + t('length') + '</span><div class="seg" id="lbLen"></div></div>' +
        '<div class="opt"><span class="lbl">' + t('timer') + '</span><div class="seg" id="lbTime"></div></div>' +
        '<div class="opt"><span class="lbl">' + t('fillBots') + '</span><div class="seg" id="lbFill"></div></div>' +
        '<div class="opt"><span class="lbl">' + t('tableSize') + '</span><div class="seg" id="lbSize"></div></div>';
      const send = function (patch) { if (host) K.Net.send('room:settings', Object.assign({}, s, patch)); };
      seg($('#lbLen'), [{ v: 4, label: t('quick') + '<i>4</i>' }, { v: 6, label: t('standard') + '<i>6</i>' }, { v: 10, label: t('long') + '<i>10</i>' }], s.hp, function (v) { send({ hp: Number(v) }); });
      seg($('#lbTime'), [20, 30, 40, 60].map(function (n) { return { v: n, label: n + t('sec') }; }), s.timer, function (v) { send({ timer: Number(v) }); });
      seg($('#lbSize'), [5, 6, 7, 8].map(function (n) { return { v: n, label: (n === 5 ? t('classic') + ' ' : '') + n }; }), s.size || 5, function (v) { send({ size: Number(v) }); });
      seg($('#lbFill'), [{ v: '1', label: t('on') }, { v: '0', label: t('off') }], s.fill ? '1' : '0', function (v) { send({ fill: v === '1' }); });
      $$('#lobbyOpts button').forEach(function (b) { b.disabled = !host; });
      $('#lobbyStart').hidden = !host;
      $('#lobbyWait').hidden = host;
      $('#lobbyErr').hidden = true;
      K.VC.syncUI();
      void self;
    },
    startRoom: function () {
      K.Net.call('room:start').then(function (r) {
        if (!r || !r.ok) { const e = $('#lobbyErr'); e.textContent = t('needTwo'); e.hidden = false; }
      });
    },
    onlineSession: function () {
      return {
        mode: 'online', me: K.Net.me,
        send: function (type, data) { K.Net.send('game:' + type, data); },
        pause: function () {}, resume: function () {},
        leave: function (keep) { if (!keep) { K.VC.closeAll(); K.Net.leave(); } }
      };
    },

    /* ---------- pause ---------- */
    openPause: function () {
      if (!K.Game.active()) return;
      K.Game.pause();
      $('#pauseNote').hidden = K.Game.mode() !== 'online';
      $('#pQuit').textContent = K.Game.mode() === 'online' ? t('leaveMatch') : t('quit');
      $('#ovPause').hidden = false;
      try { $('#pResume').focus({ preventScroll: true }); } catch (e) {}
    },
    closePause: function () { $('#ovPause').hidden = true; K.Game.resume(); },

    /* ---------- end of match ---------- */
    showEnd: function (d) {
      const me = d.me, won = d.winner === me;
      const card = $('#endCard');
      card.className = 'card end-card ' + (won ? 'win' : 'lose');
      const meRow = d.standings.filter(function (s) { return s.id === me; })[0];
      const hero = won ? meRow : d.standings.filter(function (s) { return s.id === d.winner; })[0];
      $('#endHero').innerHTML = (hero ? '<div class="crown">&#9830;</div><div class="end-av">' + K.avatarBust(hero.avatar, won ? 'grin' : 'smirk') + '</div>' : '') +
        '<h2>' + (won ? t('gameClear') : t('gameOver')) + '</h2><p>' + (d.winner ? (won ? t('sayClear') : t('winsMatch', hero ? hero.name : '?')) : t('noSurvivor')) + '</p>';
      $('#endStand').innerHTML = d.standings.map(function (s, i) {
        return '<li class="' + (s.id === me ? 'me' : '') + '" style="animation-delay:' + (i * 0.08) + 's"><span class="pl">' + (i + 1) + '</span><span class="st-av" style="--c:' + K.accentOf(s.avatar) + '">' + K.avatarHead(s.avatar) + '</span>' +
          '<b>' + (s.id === me ? s.name + ' (' + t('you') + ')' : s.name) + '</b><small>' + (s.alive ? t('survivor') : t('outIn', s.outRound)) + '</small></li>';
      }).join('');
      $('#endStats').innerHTML = '<div><span>' + t('statRounds') + '</span><b>' + d.rounds + '</b></div><div><span>' + t('statWon') + '</span><b>' + d.stats.won + '</b></div>' +
        '<div><span>' + t('statClose') + '</span><b>' + (d.stats.close == null ? '—' : d.stats.close.toFixed(1)) + '</b></div>';
      const place = d.standings.map(function (s) { return s.id; }).indexOf(me) + 1;
      $('#endShare').textContent = won ? t('shareWin', d.rounds) : t('share', place, d.rounds, d.standings.length);
      $('#endAgain').textContent = d.mode === 'online' && !this.quick ? t('backRoom') : t('playAgain');
      this.endMode = d.mode;
      K.record.played++; if (won) K.record.won++; saveR();
      $('#ovEnd').hidden = false;
    }
  };

  function setLang(l) {
    K.lang = l === 'hi' ? 'hi' : 'en';
    K.settings.lang = K.lang; saveS();
    K.Voice.stop();
    applyLang();
  }
  function applyLang() {
    document.documentElement.lang = K.lang;
    $$('[data-t]').forEach(function (el) { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v; });
    $('#mLang').textContent = K.lang === 'hi' ? 'हिं' : 'EN';
    if (UI.cur && UI.cur !== 'game' && UI['render_' + UI.cur]) UI['render_' + UI.cur]();
  }
  function syncTools() {
    $('#mMusic').setAttribute('aria-pressed', String(K.settings.music));
    $('#gVoice').setAttribute('aria-pressed', String(K.settings.voice));
    $('#gSfx').setAttribute('aria-pressed', String(K.settings.sfx));
  }

  UI.init = function () {
    const self = this;
    applyLang(); syncTools();
    // first interaction unlocks audio
    const unlock = function () {
      K.Sfx.ensure(); K.Sfx.sync();
      if (self.cur !== 'game' && !K.Music.mode) K.Music.set('menu');
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock); document.addEventListener('keydown', unlock);

    $$('.mi').forEach(function (b) {
      b.addEventListener('mouseenter', function () { K.Sfx.play('hover'); });
      b.addEventListener('click', function () {
        K.Sfx.ensure(); K.Sfx.play('click');
        const go = b.dataset.go;
        if (go === 'create') self.createRoom();
        else if (go === 'quick') self.quickMatch();
        else self.go(go);
      });
    });
    $$('[data-land]').forEach(function (b) {
      b.addEventListener('click', function () { K.Sfx.ensure(); K.Sfx.play('click'); if (b.dataset.land === 'quick') self.quickMatch(); else self.go(b.dataset.land); });
    });
    $('.scroll-cue').addEventListener('click', function (e) { e.preventDefault(); const tg = $('#land-how'); if (tg) tg.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $$('[data-back]').forEach(function (b) { b.addEventListener('click', function () { K.Sfx.play('back'); if (self.reading) { self.readStop = true; K.Voice.stop(); K.Ann.stop(); } self.back(); }); });
    $('#meChip').addEventListener('click', function () { K.Sfx.play('click'); self.go('profile'); });
    $('#mLang').addEventListener('click', function () { setLang(K.lang === 'en' ? 'hi' : 'en'); });
    $('#mMusic').addEventListener('click', function () {
      K.settings.music = !K.settings.music; saveS(); K.Sfx.ensure(); K.Sfx.sync();
      if (K.settings.music && !K.Music.mode) K.Music.set('menu');
      syncTools();
    });

    $('#soloStart').addEventListener('click', function () { K.Sfx.play('click'); self.startSolo(); });

    $('#tabPresets').addEventListener('click', function () { self.setTab('presets'); });
    $('#tabCustom').addEventListener('click', function () { self.setTab('custom'); });
    $('#profName').addEventListener('input', function () { K.profile.name = Pre.cleanName($('#profName').value); saveP(); });
    $('#profName').addEventListener('change', function () { self.commit(); });
    $('#profRand').addEventListener('click', function () { K.Sfx.play('shine'); self.draft = Pre.randomAvatar(); self.commit(); self.renderCustom(); self.renderPresets(); });
    $('#profSave').addEventListener('click', function () { self.commit(); K.Sfx.play('win'); toast(t('saved')); self.back(); });

    $$('#rbLang button').forEach(function (b) { b.addEventListener('click', function () { setLang(b.dataset.v); }); });
    $('#rbAll').addEventListener('click', function () { self.read(null); });
    $('#setTest').addEventListener('click', function () { K.Sfx.ensure(); if (K.Ann.has(['test'])) K.Ann.play(['test']); else K.Voice.speak(t('voiceTest'), K.lang); });

    $('#joinForm').addEventListener('submit', function (e) { e.preventDefault(); self.joinRoom($('#joinCode').value); });
    $('#joinCode').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });

    $('#lobbyLeave').addEventListener('click', function () { K.VC.closeAll(); K.Net.leave(); self.go('menu'); });
    $('#lobbyMic').addEventListener('click', function () { K.Sfx.ensure(); K.VC.toggle(); });
    $('#gMic').addEventListener('click', function () { K.Sfx.ensure(); K.VC.toggle(); });
    $('#lobbyStart').addEventListener('click', function () { K.Sfx.play('click'); self.startRoom(); });
    $('#copyCode').addEventListener('click', function () { copy(K.Net.room ? K.Net.room.code : '', $('#copyCode'), 'copyCode'); });
    $('#copyLink').addEventListener('click', function () { copy(location.origin + location.pathname + '?room=' + (K.Net.room ? K.Net.room.code : ''), $('#copyLink'), 'copyLink'); });

    K.Net.on('room', function (st) {
      K.VC.sync(st);
      if (st && st.public) { if (self.cur === 'queue') self.render_queue(); return; }
      if (self.cur === 'lobby') self.render_lobby();
    });
    $('#qBack').addEventListener('click', function () { K.Sfx.play('back'); self.leaveQueue(); });
    $('#qBots').addEventListener('click', function () {
      K.Sfx.play('click'); $('#qBots').disabled = true;
      K.Net.call('quick:bots').then(function () { $('#qBots').disabled = false; });
    });
    $('#qKeep').addEventListener('click', function () { K.Sfx.play('click'); self.qKept = Date.now() + 20000; self.qTick(); });
    K.Net.on('kicked', function () { K.VC.closeAll(); toast(t('kicked')); K.Game.stop(); $('#ovEnd').hidden = true; self.go('menu'); });
    K.Net.on('disconnect', function () {
      if (self.cur === 'lobby' || self.cur === 'queue' || (self.cur === 'game' && K.Game.mode() === 'online')) {
        toast(t('disconnected')); K.Game.stop(true); $('#ovEnd').hidden = true; $('#ovPause').hidden = true; self.go('menu');
      }
    });
    K.Net.on('game', function (ev) {
      if (ev.type === 'start') {
        $('#ovEnd').hidden = true;
        self.lastMode = 'online';
        $('#gMic').hidden = !K.VC.supported();
        self.go('game');
        K.Music.set('game');
        K.Game.begin(self.onlineSession());
      }
      K.Game.event(ev.type, ev.data);
    });

    $('#gMenu').addEventListener('click', function () { self.openPause(); });
    $('#gRules').addEventListener('click', function () { self.openPause(); self.from = 'game'; $('#ovPause').hidden = true; self.go('rules'); });
    $('#gVoice').addEventListener('click', function () { K.settings.voice = !K.settings.voice; saveS(); if (!K.settings.voice) K.Voice.stop(); syncTools(); });
    $('#gSfx').addEventListener('click', function () { K.settings.sfx = !K.settings.sfx; K.settings.music = K.settings.sfx; saveS(); K.Sfx.ensure(); K.Sfx.sync(); syncTools(); });
    $('#cap').addEventListener('click', function () { K.Game.skip(); });
    $('#pResume').addEventListener('click', function () { self.closePause(); });
    $('#pRules').addEventListener('click', function () { $('#ovPause').hidden = true; self.from = 'game'; self.go('rules'); });
    $('#pSettings').addEventListener('click', function () { $('#ovPause').hidden = true; self.from = 'game'; self.go('settings'); });
    $('#pQuit').addEventListener('click', function () { $('#ovPause').hidden = true; self.from = null; K.Game.stop(); self.quick = false; self.go('menu'); });
    $('#rcGo').addEventListener('click', function () { K.Sfx.play('click'); K.Game.ruleContinue(); });

    $('#endAgain').addEventListener('click', function () {
      $('#ovEnd').hidden = true;
      if (self.endMode === 'online' && self.quick) { K.Game.stop(); self.quickMatch(); }
      else if (self.endMode === 'online') { K.Game.stop(true); self.go('lobby'); }
      else { K.Game.stop(); self.startSolo(); }
    });
    $('#endMenu').addEventListener('click', function () { $('#ovEnd').hidden = true; K.Game.stop(); self.quick = false; self.go('menu'); });
    $('#endCopy').addEventListener('click', function () { copy($('#endShare').textContent, $('#endCopy'), 'copyResult'); });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!$('#ovRule').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); K.Game.ruleContinue(); } return; }
      if (!$('#ovPause').hidden) { if (e.key === 'Escape') self.closePause(); return; }
      if (!$('#ovEnd').hidden) return;
      if (self.cur === 'game') {
        if (e.key === 'Escape') { self.openPause(); return; }
        const tag = document.activeElement && document.activeElement.tagName;
        if (e.key === ' ' && tag === 'BUTTON') return;
        if (K.Game.key(e)) e.preventDefault();
        return;
      }
      if (e.key === 'Escape' && self.cur !== 'menu' && self.cur !== 'lobby') self.back();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.cur === 'game' && K.Game.mode() === 'solo' && $('#ovPause').hidden && $('#ovEnd').hidden) self.openPause();
    });
  };

  K.UI = UI;
  K.toast = toast;
})();
