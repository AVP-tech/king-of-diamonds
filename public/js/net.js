/* King of Diamonds: online rooms over Socket.IO. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};

  const Net = {
    socket: null, me: null, room: null, handlers: {},
    server: function () { return String(window.KOD_SERVER || '').replace(/\/+$/, ''); },
    available: function () { return typeof window.io === 'function' && (!!this.server() || location.protocol !== 'file:'); },
    connect: function () {
      const self = this;
      if (this.socket) return Promise.resolve(this.socket);
      if (!this.available()) return Promise.reject(new Error('offline'));
      return new Promise(function (resolve, reject) {
        const opts = { transports: ['websocket', 'polling'], reconnection: true }, url = self.server();
        const s = url ? window.io(url, opts) : window.io(opts);
        let settled = false;
        // a free server that was asleep can take up to a minute to wake, so wait longer for a remote one
        const timer = setTimeout(function () { if (!settled) { settled = true; s.close(); reject(new Error('timeout')); } }, url ? 60000 : 8000);
        s.on('connect', function () {
          self.socket = s; self.me = s.id;
          s.emit('profile', K.profile);
          if (!settled) { settled = true; clearTimeout(timer); resolve(s); }
        });
        let fails = 0;
        s.on('connect_error', function () { fails++; if (!settled && (!url || fails > 12)) { settled = true; clearTimeout(timer); s.close(); reject(new Error('offline')); } });
        s.on('disconnect', function () { self.fire('disconnect'); });
        s.on('room:state', function (st) { self.room = st; self.fire('room', st); });
        s.on('room:kicked', function () { self.room = null; self.fire('kicked'); });
        s.on('rtc:signal', function (d) { self.fire('rtc', d); });
        s.on('rtc:talk', function (d) { self.fire('rtcTalk', d); });
        ['start', 'round', 'locked', 'autopick', 'reveal', 'player', 'over'].forEach(function (e) {
          s.on('game:' + e, function (d) { self.fire('game', { type: e, data: d }); });
        });
      });
    },
    on: function (ev, fn) { this.handlers[ev] = fn; },
    fire: function (ev, d) { if (this.handlers[ev]) this.handlers[ev](d); },
    call: function (ev, data) {
      const s = this.socket;
      return new Promise(function (resolve) { if (!s) { resolve({ ok: false, err: 'offline' }); return; } s.emit(ev, data || {}, function (r) { resolve(r || { ok: true }); }); });
    },
    send: function (ev, data) { if (this.socket) this.socket.emit(ev, data || {}); },
    profile: function () { this.send('profile', K.profile); },
    leave: function () { this.send('room:leave'); this.room = null; }
  };

  K.Net = Net;
})();
