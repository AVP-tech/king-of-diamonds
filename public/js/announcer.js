/* King of Diamonds: the recorded announcer. Lines are pre-recorded clips (neural voice, English and
   Hindi) that get stitched together: "The average is" + "twenty-six" + "point" + "four". */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};

  const Ann = {
    cur: null,
    has: function (keys) {
      const m = window.KOD_VOICE && window.KOD_VOICE[K.lang];
      if (!m || !keys || !keys.length) return false;
      for (let i = 0; i < keys.length; i++) if (!m[keys[i]]) return false;
      return true;
    },
    play: function (keys) {
      const self = this;
      return new Promise(function (res) {
        self.stop();
        const base = 'audio/voice/' + K.lang + '/';
        const list = keys.map(function (k) { const a = new Audio(base + k + '.mp3'); a.preload = 'auto'; return a; });
        let i = 0, done = false;
        const me = { list: list };
        const finish = function () {
          if (done) return; done = true; clearTimeout(guard);
          if (K.Music) K.Music.duck(false);
          if (self.cur === me) self.cur = null;
          res(true);
        };
        me.finish = finish;
        self.cur = me;
        if (K.Music) K.Music.duck(true);
        // each clip hands over to the next one just before its reverb tail ends
        const next = function () {
          if (done) return;
          if (i >= list.length) { finish(); return; }
          const a = list[i++];
          let moved = false, tmo = null;
          const go = function () { if (moved) return; moved = true; clearTimeout(tmo); next(); };
          a.onplaying = function () {
            const d = a.duration;
            if (isFinite(d) && d > 0.45 && i < list.length) tmo = setTimeout(go, (d - 0.17) * 1000);
          };
          a.onended = go;
          a.onerror = go;
          const p = a.play();
          if (p && p.catch) p.catch(go);
        };
        const guard = setTimeout(finish, 8000 + keys.length * 2500);
        next();
      });
    },
    stop: function () {
      const c = this.cur; this.cur = null;
      if (!c) return;
      c.list.forEach(function (a) { try { a.pause(); } catch (e) {} });
      c.finish();
    }
  };
  K.Ann = Ann;
})();
