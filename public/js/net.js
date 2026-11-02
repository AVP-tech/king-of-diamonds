/* King of Diamonds: online rooms over Socket.IO.
   Each browser keeps a secret id (pid) in localStorage. The server uses it as the player's identity, so a dropped
   connection (phone locked, Chrome in the background) comes back to the same seat instead of becoming a new player. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};

  function pid() {
    let v = '';
    try { v = localStorage.getItem('kod.pid') || ''; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(v)) {
      const a = new Uint8Array(18);
      (window.crypto || window.msCrypto).getRandomValues(a);
      v = btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { localStorage.setItem('kod.pid', v); } catch (e) {}
    }
    return v;
  }

  const Net = {
    socket: null, pid: pid(), me: (function () { try { return localStorage.getItem('kod.fid') || ''; } catch (e) { return ''; } })(), fid: '', room: null, handlers: {}, wake: null, replaced: false,
    server: function () { return String(window.KOD_SERVER || '').replace(/\/+$/, ''); },
    available: function () { return typeof window.io === 'function' && (!!this.server() || location.protocol !== 'file:'); },
    connect: function () {
      const self = this;
      if (this.socket) return Promise.resolve(this.socket);
      if (!this.available()) return Promise.reject(new Error('offline'));
      return new Promise(function (resolve, reject) {
        const opts = { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000, auth: { pid: self.pid } }, url = self.server();
        const s = url ? window.io(url, opts) : window.io(opts);
        let settled = false, first = true;
        // a free server that was asleep can take up to a minute to wake, so wait longer for a remote one
        const timer = setTimeout(function () { if (!settled) { settled = true; s.close(); reject(new Error('timeout')); } }, url ? 60000 : 8000);
        s.on('connect', function () {
          self.socket = s;
          s.emit('profile', K.profile);
        });
        let fails = 0;
        s.on('connect_error', function () { fails++; if (!settled && (!url || fails > 12)) { settled = true; clearTimeout(timer); s.close(); reject(new Error('offline')); } });
        s.on('disconnect', function (why) { self.fire('disconnect', why); });
        // the server answers every connection with our public id, which is also our friend code
        s.on('session:hello', function (d) {
          self.fid = self.me = d.fid;
          try { localStorage.setItem('kod.fid', d.fid); } catch (e) {}
          if (!settled) { settled = true; clearTimeout(timer); resolve(s); }
          if (!first) self.fire('reconnect');
          first = false;
          self.fire('connected');
        });
        s.on('session:state', function (d) { self.room = d.room || null; self.fire('session', d); });
        s.on('session:replaced', function () { self.replaced = true; self.fire('replaced'); });
        s.on('room:state', function (st) { self.room = st; self.fire('room', st); });
        s.on('room:kicked', function () { self.room = null; self.fire('kicked'); });
        s.on('rtc:signal', function (d) { self.fire('rtc', d); });
        s.on('rtc:talk', function (d) { self.fire('rtcTalk', d); });
        ['chat:msg', 'chat:emote', 'friend:request', 'friend:accepted', 'friend:invite', 'dm:msg'].forEach(function (e) {
          s.on(e, function (d) { self.fire(e, d); });
        });
        ['start', 'round', 'locked', 'autopick', 'reveal', 'player', 'over', 'resync'].forEach(function (e) {
          s.on('game:' + e, function (d) { self.fire('game', { type: e, data: d }); });
        });
      });
    },
    on: function (ev, fn) { this.handlers[ev] = fn; },
    fire: function (ev, d) { if (this.handlers[ev]) this.handlers[ev](d); },
    call: function (ev, data) {
      const s = this.socket;
      return new Promise(function (resolve) {
        if (!s || !s.connected) { resolve({ ok: false, err: 'offline' }); return; }
        let done = false;
        const t = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, err: 'timeout' }); } }, 8000);
        s.emit(ev, data || {}, function (r) { if (!done) { done = true; clearTimeout(t); resolve(r || { ok: true }); } });
      });
    },
    send: function (ev, data) { if (this.socket && this.socket.connected) this.socket.emit(ev, data || {}); },
    profile: function () { this.send('profile', K.profile); },
    leave: function () { this.send('room:leave'); this.room = null; this.keepAwake(false); try { localStorage.removeItem('kod.live'); } catch (e) {} },
    // coming back to the tab: reconnect right away instead of waiting for the retry timer
    resume: function () {
      const s = this.socket;
      if (s && !s.connected && !this.replaced) s.connect();
      if (this.wake === true) this.keepAwake(true);
    },
    /* ask the screen not to sleep while waiting for or playing a match (a sleeping phone drops the connection) */
    keepAwake: async function (on) {
      try {
        if (!on) { this.wake = null; if (this._lock) { this._lock.release(); this._lock = null; } return; }
        this.wake = true;
        if (navigator.wakeLock && !this._lock && document.visibilityState === 'visible') {
          const self = this;
          this._lock = await navigator.wakeLock.request('screen');
          this._lock.addEventListener('release', function () { self._lock = null; });
        }
      } catch (e) {}
    },
    iceServers: async function () {
      if (this._ice) return this._ice;
      try {
        const r = await fetch((this.server() || '') + '/ice', { cache: 'no-store' });
        const j = await r.json();
        if (j && j.iceServers && j.iceServers.length) { this._ice = j.iceServers; return this._ice; }
      } catch (e) {}
      return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    }
  };

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') Net.resume(); });
  window.addEventListener('online', function () { Net.resume(); });
  window.addEventListener('pageshow', function () { Net.resume(); });

  K.Net = Net;
})();
