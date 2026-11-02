/* King of Diamonds: table chat, emotes, friends and private messages. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const $ = function (s) { return document.querySelector(s); };
  const t = function () { return K.t.apply(null, arguments); };
  const FKEY = 'kod-friends-v1', DKEY = 'kod-dm-v1';
  const EMOTES = { laugh: '😂', wow: '😮', cool: '😎', think: '🤔', clap: '👏', angry: '😠', skull: '💀', salute: '🫡', sweat: '😅', heart: '❤️' };
  K.EMOTES = EMOTES;
  const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  const load = function (k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
  const save = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const normFid = function (v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); };

  const Social = {
    friends: load(FKEY, []), threads: load(DKEY, {}), reqs: {}, unread: {}, presence: {}, open: null,
    chat: [], chatRoom: null, chatUnread: 0, chatOpen: false, pollIv: null, inviteT: null,

    /* ---------- chat panel + emotes (lobby, queue, game) ---------- */
    init: function () {
      const self = this;
      const fab = document.createElement('button');
      fab.type = 'button'; fab.id = 'chatFab'; fab.className = 'chat-fab'; fab.hidden = true;
      fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg><i class="badge" id="chatBadge" hidden></i>';
      const panel = document.createElement('div');
      panel.id = 'chatPanel'; panel.className = 'chat-panel'; panel.hidden = true;
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat');
      panel.innerHTML = '<div class="chat-head"><b id="chatTitle"></b><button type="button" class="chat-x" id="chatClose">×</button></div>' +
        '<div class="chat-log" id="chatLog" aria-live="polite"></div>' +
        '<div class="emote-row" id="emoteRow"></div>' +
        '<form class="chat-form" id="chatForm" autocomplete="off"><input class="txt" id="chatIn" maxlength="140"><button type="submit" class="btn gold" id="chatSend"></button></form>';
      const inv = document.createElement('div');
      inv.id = 'inviteBar'; inv.className = 'invite-bar'; inv.hidden = true;
      const fl = document.createElement('div'); fl.id = 'emoteFloat'; fl.className = 'emote-float'; fl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fab); document.body.appendChild(panel); document.body.appendChild(inv); document.body.appendChild(fl);
      fab.addEventListener('click', function () { K.Sfx.play('click'); self.toggleChat(); });
      $('#chatClose').addEventListener('click', function () { self.toggleChat(false); });
      $('#chatForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const v = $('#chatIn').value.trim(); if (!v) return;
        K.Net.send('chat:msg', { text: v }); $('#chatIn').value = '';
      });
      $('#emoteRow').innerHTML = Object.keys(EMOTES).map(function (k) {
        return '<button type="button" class="em" data-e="' + k + '" aria-label="' + t('em_' + k) + '" title="' + t('em_' + k) + '">' + EMOTES[k] + '</button>';
      }).join('');
      $('#emoteRow').addEventListener('click', function (e) {
        const b = e.target.closest('.em'); if (!b) return;
        K.Net.send('chat:emote', { e: b.dataset.e });
      });
      this.labels();

      K.Net.on('chat:msg', function (m) { self.onMsg(m); });
      K.Net.on('chat:emote', function (m) { self.onEmote(m); });
      K.Net.on('friend:request', function (r) { self.onRequest(r, true); });
      K.Net.on('friend:accepted', function (f) { self.addFriend(f); K.toast(t('friendAcc', f.name)); self.sync(); self.renderIfOpen(); });
      K.Net.on('friend:invite', function (d) { self.onInvite(d); });
      K.Net.on('dm:msg', function (m) { self.onDm(m); });
      K.Net.on('connected', function () { self.sync(); });
      this.badge();
      // friends arrive and invites reach you only while a connection is open, so keep one if you have friends
      if (this.friends.length && K.Net.available()) setTimeout(function () { K.Net.connect().catch(function () {}); }, 2500);
    },
    labels: function () {
      const set = function (s, k, attr) { const el = $(s); if (!el) return; if (attr) el.setAttribute(attr, t(k)); else el.textContent = t(k); };
      set('#chatTitle', 'chat'); set('#chatSend', 'send'); set('#chatIn', 'chatPh', 'placeholder'); set('#chatClose', 'closeChat', 'aria-label');
      set('#chatFab', 'chat', 'aria-label');
      document.querySelectorAll('[data-ph]').forEach(function (el) { el.setAttribute('placeholder', t(el.dataset.ph)); });
      document.querySelectorAll('#emoteRow .em').forEach(function (b) { b.title = t('em_' + b.dataset.e); b.setAttribute('aria-label', t('em_' + b.dataset.e)); });
      this.renderChat();
    },
    /* the chat button shows where there is a table to talk to */
    syncChat: function () {
      const st = K.Net.room, cur = K.UI && K.UI.cur;
      const inGame = cur === 'game' && K.Game.mode() === 'online';
      const on = !!(st && K.Net.socket && (cur === 'lobby' || cur === 'queue' || inGame));
      const fab = $('#chatFab'); if (!fab) return;
      fab.hidden = !on;
      fab.classList.toggle('in-game', inGame);
      if (!on) { this.toggleChat(false); }
      if (st && st.code !== this.chatRoom) { this.chat = []; this.chatRoom = st.code; this.chatUnread = 0; this.badge(); this.renderChat(); }
      if (!st) { this.chatRoom = null; }
    },
    toggleChat: function (force) {
      const open = force === undefined ? !this.chatOpen : !!force;
      this.chatOpen = open;
      const p = $('#chatPanel'); if (!p) return;
      p.hidden = !open;
      if (open) { this.chatUnread = 0; this.badge(); this.renderChat(); if (!matchMedia('(pointer: coarse)').matches) { try { $('#chatIn').focus({ preventScroll: true }); } catch (e) {} } }
    },
    badge: function () {
      const b = $('#chatBadge'); if (b) { b.hidden = !this.chatUnread; b.textContent = this.chatUnread > 9 ? '9+' : this.chatUnread; }
      const fb = $('#friendsBadge');
      if (fb) {
        const n = Object.keys(this.reqs).length + Object.keys(this.unread).reduce(function (a, k) { return a + this.unread[k]; }.bind(this), 0);
        fb.hidden = !n; fb.textContent = n > 9 ? '9+' : n;
      }
    },
    renderChat: function () {
      const el = $('#chatLog'); if (!el) return;
      const me = K.Net.me;
      if (!this.chat.length) { el.innerHTML = '<p class="chat-empty">' + esc(t('chatEmpty')) + '</p>'; return; }
      el.innerHTML = this.chat.map(function (m) {
        const who = m.id === me ? t('you') : m.name;
        return '<div class="cm' + (m.id === me ? ' me' : '') + '"><b>' + esc(who) + '</b> ' + (m.e ? '<span class="cm-e">' + EMOTES[m.e] + '</span>' : '<span>' + esc(m.text) + '</span>') + '</div>';
      }).join('');
      el.scrollTop = el.scrollHeight;
    },
    nameOf: function (id) {
      const st = K.Net.room; const m = st && st.members.filter(function (x) { return x.id === id; })[0];
      return m ? m.name : '?';
    },
    onMsg: function (m) {
      this.chat.push({ id: m.id, name: m.name, text: m.text }); if (this.chat.length > 80) this.chat.shift();
      if (this.chatOpen) this.renderChat(); else if (m.id !== K.Net.me) { this.chatUnread++; this.badge(); K.Sfx.play('hover'); }
      if (K.UI.cur === 'game' && m.id !== K.Net.me) K.Game.say(m.id, m.text.length > 60 ? m.text.slice(0, 58) + '…' : m.text);
    },
    onEmote: function (m) {
      const em = EMOTES[m.e]; if (!em) return;
      this.chat.push({ id: m.id, name: this.nameOf(m.id), e: m.e }); if (this.chat.length > 80) this.chat.shift();
      if (this.chatOpen) this.renderChat();
      this.float(m.id, em);
    },
    /* an emoji rising over a player: above the head in 3D, on the seat in the lobby, or in the middle for yourself */
    float: function (id, em) {
      const cur = K.UI.cur;
      if (cur === 'game' && id !== K.Net.me && K.Game.say(id, em)) return;
      let host = null;
      if (cur === 'lobby' || cur === 'queue') host = document.querySelector('[data-id="' + id + '"]');
      const span = document.createElement('span');
      span.className = 'efl'; span.textContent = em;
      if (host) {
        const r = host.getBoundingClientRect();
        span.style.left = (r.left + r.width / 2) + 'px'; span.style.top = (r.top + r.height * 0.3) + 'px';
      } else {
        span.style.left = (window.innerWidth * (id === K.Net.me ? 0.5 : 0.3 + Math.random() * 0.4)) + 'px'; span.style.top = (window.innerHeight * 0.55) + 'px';
      }
      $('#emoteFloat').appendChild(span);
      setTimeout(function () { span.remove(); }, 2300);
    },

    /* ---------- friends ---------- */
    saveF: function () { save(FKEY, this.friends); },
    saveD: function () { save(DKEY, this.threads); },
    isFriend: function (fid) { return this.friends.some(function (f) { return f.fid === fid; }); },
    addFriend: function (f) {
      if (!f || !f.fid || f.fid === K.Net.fid) return;
      const ex = this.friends.filter(function (x) { return x.fid === f.fid; })[0];
      if (ex) { ex.name = f.name || ex.name; ex.avatar = f.avatar || ex.avatar; } else this.friends.push({ fid: f.fid, name: f.name, avatar: f.avatar, since: Date.now() });
      delete this.reqs[f.fid];
      this.saveF(); this.badge();
    },
    sync: function () {
      const self = this;
      if (!K.Net.socket || !K.Net.socket.connected) return Promise.resolve();
      return K.Net.call('friend:sync', { fids: this.friends.map(function (f) { return f.fid; }) }).then(function (r) {
        if (!r || !r.ok) return;
        const ib = r.inbox || {};
        (ib.requests || []).forEach(function (q) { self.onRequest(q, false); });
        (ib.accepts || []).forEach(function (f) { self.addFriend(f); K.toast(t('friendAcc', f.name)); });
        (ib.dms || []).forEach(function (m) { self.onDm(m, true); });
        if (ib.accepts && ib.accepts.length) return self.sync();
        self.refreshPresence(); self.renderIfOpen(); self.badge();
      });
    },
    refreshPresence: function () {
      const self = this;
      if (!this.friends.length || !K.Net.socket || !K.Net.socket.connected) return Promise.resolve();
      return K.Net.call('friend:presence', { fids: this.friends.map(function (f) { return f.fid; }) }).then(function (r) {
        if (!r || !r.ok) return;
        self.presence = r.presence || {};
        let dirty = false;
        self.friends.forEach(function (f) { const p = self.presence[f.fid]; if (p && (p.name !== f.name || JSON.stringify(p.avatar) !== JSON.stringify(f.avatar))) { f.name = p.name; f.avatar = p.avatar; dirty = true; } });
        if (dirty) self.saveF();
        self.renderIfOpen();
      });
    },
    onRequest: function (r, live) {
      if (!r || !r.fid || this.isFriend(r.fid)) return;
      const fresh = !this.reqs[r.fid];
      this.reqs[r.fid] = r;
      this.badge(); this.renderIfOpen();
      if (live && fresh) { K.toast(t('friendReq', r.name)); K.Sfx.play('shine'); }
    },
    accept: function (fid) {
      const self = this;
      K.Net.call('friend:accept', { fid: fid }).then(function (r) {
        if (r && r.ok && r.friend) { self.addFriend(r.friend); K.toast(t('friendAdded', r.friend.name)); self.sync(); }
        else { delete self.reqs[fid]; }
        self.badge(); self.renderIfOpen();
      });
    },
    decline: function (fid) { K.Net.send('friend:decline', { fid: fid }); delete this.reqs[fid]; this.badge(); this.renderIfOpen(); },
    remove: function (fid) {
      this.friends = this.friends.filter(function (f) { return f.fid !== fid; });
      delete this.threads[fid]; delete this.unread[fid];
      this.saveF(); this.saveD(); this.badge();
      if (this.open === fid) this.closeDm();
      this.sync(); this.renderIfOpen();
    },
    msg: function (text, bad) {
      const el = $('#fMsg'); if (!el) return;
      el.textContent = text; el.hidden = !text; el.classList.toggle('warn', !!bad);
    },
    sendRequest: function (code) {
      const self = this, fid = normFid(code);
      if (fid.length !== 7) { this.msg(t('reqBadCode'), true); return; }
      if (fid === K.Net.fid) { this.msg(t('reqSelf'), true); return; }
      K.Net.call('friend:request', { fid: fid }).then(function (r) {
        if (r && r.ok) { self.msg(t('reqSent', r.name)); $('#fAddIn').value = ''; return; }
        const e = r && r.err;
        self.msg(t(e === 'self' ? 'reqSelf' : e === 'already' ? 'reqAlready' : e === 'busy' ? 'reqBusy' : e === 'notfound' ? 'reqNotFound' : 'errOffline'), true);
      });
    },
    link: function () { return location.origin + location.pathname + '?friend=' + (K.Net.fid || ''); },
    /* someone opened a ?friend=CODE link */
    fromLink: function (code) {
      const self = this;
      K.UI.requireName(function () {
        K.UI.go('friends');
        K.UI.connect().then(function () { return self.sync(); }).then(function () {
          const fid = normFid(code);
          if (fid && fid !== K.Net.fid && !self.isFriend(fid)) { $('#fAddIn').value = fid; self.sendRequest(fid); }
        }).catch(function () {});
      });
    },

    /* ---------- the friends screen ---------- */
    show: function () {
      const self = this;
      this.msg('');
      this.closeDm(true);
      this.render();
      K.UI.connect().then(function () { self.sync(); self.render(); }).catch(function () {});
      clearInterval(this.pollIv);
      this.pollIv = setInterval(function () {
        if (K.UI.cur !== 'friends') { clearInterval(self.pollIv); self.pollIv = null; return; }
        self.refreshPresence();
      }, 10000);
    },
    renderIfOpen: function () { if (K.UI && K.UI.cur === 'friends') this.render(); },
    statusOf: function (fid) {
      const p = this.presence[fid];
      if (!p || p.status === 'offline') return { on: false, txt: t('stOffline') };
      const map = { menu: 'stMenu', lobby: 'stLobby', queue: 'stQueue', playing: 'stPlaying' };
      return { on: true, txt: t(map[p.status] || 'stOnline'), p: p };
    },
    render: function () {
      const self = this;
      const code = K.Net.fid || ''; $('#fCode').textContent = code || '·······';
      $('#fReqs').innerHTML = Object.keys(this.reqs).length
        ? '<h3 class="eyebrow">' + esc(t('reqsTitle')) + '</h3>' + Object.keys(this.reqs).map(function (k) {
          const r = self.reqs[k];
          return '<div class="frow req"><span class="q-av" style="--c:' + K.accentOf(r.avatar) + '">' + K.avatarHead(r.avatar) + '</span><b>' + esc(r.name) + '</b><span class="fr-btns"><button type="button" class="btn sm gold" data-acc="' + r.fid + '">' + esc(t('accept')) + '</button><button type="button" class="btn sm ghost" data-dec="' + r.fid + '">' + esc(t('decline')) + '</button></span></div>';
        }).join('') : '';
      const myRoom = K.Net.room && !K.Net.room.public && K.Net.room.status === 'lobby';
      $('#fList').innerHTML = this.friends.length ? this.friends.map(function (f) {
        const st = self.statusOf(f.fid), un = self.unread[f.fid] || 0;
        const canJoin = st.p && st.p.status === 'lobby' && st.p.code && !st.p.full;
        return '<div class="frow' + (st.on ? ' on' : '') + '"><span class="q-av" style="--c:' + K.accentOf(f.avatar) + '">' + K.avatarHead(f.avatar) + '</span>' +
          '<span class="fr-t"><b>' + esc(f.name) + '</b><small><i class="dot"></i>' + esc(st.txt) + '</small></span><span class="fr-btns">' +
          (canJoin ? '<button type="button" class="btn sm gold" data-join="' + st.p.code + '">' + esc(t('joinThem')) + '</button>' : '') +
          (myRoom && st.on ? '<button type="button" class="btn sm ghost" data-inv="' + f.fid + '">' + esc(t('invite')) + '</button>' : '') +
          '<button type="button" class="btn sm ghost fr-chat" data-dm="' + f.fid + '">' + esc(t('chatBtn')) + (un ? '<i class="badge">' + un + '</i>' : '') + '</button>' +
          '<button type="button" class="x" data-rm="' + f.fid + '" aria-label="' + esc(t('removeFriend')) + ' ' + esc(f.name) + '">×</button></span></div>';
      }).join('') : '<p class="note">' + esc(t('noFriends')) + '</p>';
    },
    openDm: function (fid) {
      const f = this.friends.filter(function (x) { return x.fid === fid; })[0]; if (!f) return;
      this.open = fid; delete this.unread[fid]; this.badge();
      $('#fMain').hidden = true; $('#fDm').hidden = false;
      $('#dmAv').innerHTML = K.avatarHead(f.avatar); $('#dmAv').style.setProperty('--c', K.accentOf(f.avatar));
      $('#dmName').textContent = f.name; $('#dmSt').textContent = this.statusOf(fid).txt;
      this.renderDm();
      try { $('#dmIn').focus({ preventScroll: true }); } catch (e) {}
    },
    closeDm: function (quiet) {
      this.open = null;
      const m = $('#fMain'), d = $('#fDm'); if (m) m.hidden = false; if (d) d.hidden = true;
      if (!quiet) this.render();
    },
    renderDm: function () {
      const log = this.threads[this.open] || [];
      $('#dmLog').innerHTML = log.length ? log.map(function (m) { return '<div class="cm' + (m.me ? ' me' : '') + '"><span>' + esc(m.text) + '</span></div>'; }).join('') : '<p class="chat-empty">' + esc(t('dmEmpty')) + '</p>';
      $('#dmLog').scrollTop = $('#dmLog').scrollHeight;
    },
    pushDm: function (fid, me, text) {
      const l = this.threads[fid] = this.threads[fid] || [];
      l.push({ me: me, text: text, t: Date.now() }); if (l.length > 60) l.shift();
      this.saveD();
    },
    sendDm: function (text) {
      const self = this, fid = this.open; text = String(text || '').trim(); if (!fid || !text) return;
      K.Net.call('dm:send', { fid: fid, text: text }).then(function (r) {
        if (r && r.ok) { self.pushDm(fid, true, text.slice(0, 300)); $('#dmIn').value = ''; self.renderDm(); }
        else K.toast(t('dmFail'));
      });
    },
    onDm: function (m, quiet) {
      if (!this.isFriend(m.fid)) return;
      this.pushDm(m.fid, false, m.text);
      if (this.open === m.fid && K.UI.cur === 'friends') { this.renderDm(); return; }
      this.unread[m.fid] = (this.unread[m.fid] || 0) + 1;
      this.badge(); this.renderIfOpen();
      if (!quiet) { K.toast(t('dmFrom', m.name, m.text.slice(0, 60))); K.Sfx.play('hover'); }
    },
    invite: function (fid) {
      K.Net.call('friend:invite', { fid: fid }).then(function (r) {
        K.toast(t(r && r.ok ? 'inviteSent' : r && r.err === 'noroom' ? 'inviteNeedRoom' : 'inviteOffline'));
      });
    },
    onInvite: function (d) {
      const self = this, bar = $('#inviteBar');
      if (!this.isFriend(d.fid) || (K.UI.cur === 'game')) return;
      bar.innerHTML = '<span class="q-av" style="--c:' + K.accentOf(d.avatar) + '">' + K.avatarHead(d.avatar) + '</span><span class="iv-t">' + esc(t('invitedBy', d.name)) + '</span>' +
        '<button type="button" class="btn sm gold" id="ivJoin">' + esc(t('joinBtn')) + '</button><button type="button" class="x" id="ivNo" aria-label="' + esc(t('dismiss')) + '">×</button>';
      bar.hidden = false; K.Sfx.play('shine');
      clearTimeout(this.inviteT); this.inviteT = setTimeout(function () { bar.hidden = true; }, 30000);
      $('#ivNo').onclick = function () { bar.hidden = true; };
      $('#ivJoin').onclick = function () { bar.hidden = true; K.UI.joinRoom(d.code); };
    },

    /* wire up the Friends screen buttons (called once by UI.init) */
    bind: function () {
      const self = this;
      $('#fCopyCode').addEventListener('click', function () { const b = this; try { navigator.clipboard.writeText(K.Net.fid || '').then(function () { b.textContent = t('copied'); setTimeout(function () { b.textContent = t('fCopyCode'); }, 1600); }); } catch (e) { K.toast(K.Net.fid || ''); } });
      $('#fCopyLink').addEventListener('click', function () { const b = this; try { navigator.clipboard.writeText(self.link()).then(function () { b.textContent = t('copied'); setTimeout(function () { b.textContent = t('fCopyLink'); }, 1600); }); } catch (e) { K.toast(self.link()); } });
      $('#fAddIn').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); });
      $('#fAdd').addEventListener('submit', function (e) { e.preventDefault(); K.UI.requireName(function () { K.UI.go('friends'); self.sendRequest($('#fAddIn').value); }); });
      $('#fReqs').addEventListener('click', function (e) {
        const a = e.target.closest('[data-acc]'), d = e.target.closest('[data-dec]');
        if (a) self.accept(a.dataset.acc); else if (d) self.decline(d.dataset.dec);
      });
      $('#fList').addEventListener('click', function (e) {
        const j = e.target.closest('[data-join]'), v = e.target.closest('[data-inv]'), c = e.target.closest('[data-dm]'), r = e.target.closest('[data-rm]');
        if (j) K.UI.joinRoom(j.dataset.join); else if (v) self.invite(v.dataset.inv); else if (c) self.openDm(c.dataset.dm); else if (r) self.remove(r.dataset.rm);
      });
      $('#dmForm').addEventListener('submit', function (e) { e.preventDefault(); self.sendDm($('#dmIn').value); });
    }
  };
  K.Social = Social;
})();
