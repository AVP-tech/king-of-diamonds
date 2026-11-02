/* King of Diamonds: voice chat for online rooms. Peer-to-peer audio (WebRTC) between every human
   in the room, with the game server passing the connection messages. Mic is off until you turn it on. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const $ = function (s) { return document.querySelector(s); };
  const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

  const VC = {
    peers: {}, stream: null, track: null, on: false, levels: {},
    supported: function () { return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    init: function () {
      const self = this;
      K.Net.on('rtc', function (d) { self.onSignal(d); });
      K.Net.on('rtcTalk', function (d) { if (d && d.id) self.mark(d.id, d.on); });
      setInterval(function () { self.meter(); }, 120);
      this.syncUI();
    },
    /* keep one connection to every other human in the room */
    sync: function (st) {
      if (!this.supported() || !K.Net.me) return;
      const me = K.Net.me, self = this;
      const ids = st ? st.members.filter(function (m) { return !m.bot && m.id !== me; }).map(function (m) { return m.id; }) : [];
      Object.keys(this.peers).forEach(function (id) { if (ids.indexOf(id) < 0) self.close(id); });
      ids.forEach(function (id) { if (!self.peers[id] && me < id) self.connect(id); });
    },
    make: function (id) {
      const self = this, pc = new RTCPeerConnection(ICE), p = { pc: pc, pending: [], el: null, tr: null };
      this.peers[id] = p;
      pc.onicecandidate = function (e) { if (e.candidate) K.Net.send('rtc:signal', { to: id, data: { ice: e.candidate } }); };
      pc.ontrack = function (e) {
        const stream = e.streams[0] || new MediaStream([e.track]);
        if (!p.el) { p.el = document.createElement('audio'); p.el.autoplay = true; p.el.setAttribute('playsinline', ''); $('#remoteAudio').appendChild(p.el); }
        p.el.srcObject = stream;
        p.el.muted = K.settings.voiceChat === false;
        const pr = p.el.play && p.el.play(); if (pr && pr.catch) pr.catch(function () {});
        self.analyse(id, stream);
      };
      pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed') self.close(id); };
      return p;
    },
    connect: async function (id) {
      try {
        const p = this.make(id);
        p.tr = p.pc.addTransceiver('audio', { direction: 'sendrecv' });
        if (this.track) await p.tr.sender.replaceTrack(this.track);
        await p.pc.setLocalDescription(await p.pc.createOffer());
        K.Net.send('rtc:signal', { to: id, data: { sdp: p.pc.localDescription } });
      } catch (e) { console.warn('voice chat', e); }
    },
    onSignal: async function (msg) {
      const id = msg && msg.from, d = (msg && msg.data) || {};
      if (!id || !this.supported()) return;
      let p = this.peers[id];
      try {
        if (d.sdp) {
          if (d.sdp.type === 'offer') {
            if (p) this.close(id);
            p = this.make(id);
            await p.pc.setRemoteDescription(d.sdp);
            const tr = p.pc.getTransceivers()[0];
            if (tr) { tr.direction = 'sendrecv'; p.tr = tr; if (this.track) await tr.sender.replaceTrack(this.track); }
            await p.pc.setLocalDescription(await p.pc.createAnswer());
            K.Net.send('rtc:signal', { to: id, data: { sdp: p.pc.localDescription } });
          } else if (p) {
            await p.pc.setRemoteDescription(d.sdp);
          }
          if (p) { for (let i = 0; i < p.pending.length; i++) { try { await p.pc.addIceCandidate(p.pending[i]); } catch (e) {} } p.pending = []; }
        } else if (d.ice && p) {
          if (p.pc.remoteDescription) { try { await p.pc.addIceCandidate(d.ice); } catch (e) {} } else p.pending.push(d.ice);
        }
      } catch (e) { console.warn('voice chat', e); }
    },
    close: function (id) {
      const p = this.peers[id]; if (!p) return;
      try { p.pc.close(); } catch (e) {}
      if (p.el) p.el.remove();
      delete this.peers[id]; delete this.levels[id];
    },
    closeAll: function () { const self = this; Object.keys(this.peers).forEach(function (id) { self.close(id); }); this.setMic(false, true); },
    setMic: async function (on, quiet) {
      if (on) {
        if (!this.supported()) { K.toast(K.t('micUnsupported')); return false; }
        if (!window.isSecureContext) { K.toast(K.t('micInsecure')); return false; }
        try {
          if (!this.stream) {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            this.track = this.stream.getAudioTracks()[0];
            this.analyse('me', this.stream);
          }
          this.track.enabled = true;
          const tr = this.track;
          Object.keys(this.peers).forEach(function (id) { const p = VC.peers[id]; if (p.tr) p.tr.sender.replaceTrack(tr); });
          this.on = true;
        } catch (e) { K.toast(K.t('micDenied')); this.on = false; }
      } else {
        if (this.track) this.track.enabled = false;
        this.on = false;
      }
      if (!quiet) K.Net.send('rtc:mic', { on: this.on });
      this.syncUI();
      return this.on;
    },
    toggle: function () { return this.setMic(!this.on); },
    setHear: function (on) { Object.keys(this.peers).forEach(function (id) { const p = VC.peers[id]; if (p.el) p.el.muted = !on; }); },
    analyse: function (id, stream) {
      try {
        const c = K.Sfx.ensure(); if (!c) return;
        const an = c.createAnalyser(); an.fftSize = 512;
        c.createMediaStreamSource(stream).connect(an);
        this.levels[id] = { an: an, buf: new Uint8Array(an.fftSize), talk: false };
      } catch (e) {}
    },
    meter: function () {
      const self = this, me = K.Net.me;
      Object.keys(this.levels).forEach(function (id) {
        const L = self.levels[id];
        L.an.getByteTimeDomainData(L.buf);
        let s = 0;
        for (let i = 0; i < L.buf.length; i++) { const x = (L.buf[i] - 128) / 128; s += x * x; }
        const talk = Math.sqrt(s / L.buf.length) > 0.035 && (id !== 'me' || self.on);
        if (talk !== L.talk) { L.talk = talk; self.mark(id === 'me' ? me : id, talk); if (id === 'me') K.Net.send('rtc:talk', { on: talk }); }
      });
    },
    mark: function (id, on) {
      if (K.Scene && K.Scene.talking) K.Scene.talking(id, on);
      document.querySelectorAll('.seat[data-id="' + id + '"]').forEach(function (s) { s.classList.toggle('talking', on); });
      if (id === K.Net.me) { const b = $('#gMic'); if (b) b.classList.toggle('live', on); }
    },
    syncUI: function () {
      const g = $('#gMic'), l = $('#lobbyMic');
      if (g) g.setAttribute('aria-pressed', String(this.on));
      if (l) { l.setAttribute('aria-pressed', String(this.on)); const t = $('#lobbyMicT'); if (t) t.textContent = this.on ? K.t('micOn') : K.t('micOff'); }
    }
  };
  K.VC = VC;
})();
