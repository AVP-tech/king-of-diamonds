/* King of Diamonds game server: serves the game and runs Quick match, rooms, chat and friends with Socket.IO.

   Every browser gets a stable secret id (pid) that it sends when it connects. The pid never leaves the server:
   other players only see a public id (fid, a one-way hash of it), which is also the friend code. That id, not the socket id,
   is the player's identity: if a phone puts the browser in the background and the connection drops, the same
   player reconnects into the same seat instead of showing up as a second person. */
'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Match } = require('../public/js/core/engine');
const Presets = require('../public/js/core/presets');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const SIZE_OPTIONS = [3, 4, 5, 6, 7, 8];
const HP_OPTIONS = [4, 6, 10];
const TIMER_OPTIONS = [20, 30, 40, 60];
// Quick Match: strangers are seated together at a public table
const QUICK_SIZE = 5;
const QUICK_SETTINGS = { hp: 6, timer: 30, fill: true, size: 5 };
const BOT_OFFER_MS = Number(process.env.BOT_OFFER_MS) || 15000;
// how long a seat is held after the connection drops (phone in the background, bad signal)
const GRACE = {
  queue: Number(process.env.GRACE_QUEUE_MS) || 25000,
  lobby: Number(process.env.GRACE_LOBBY_MS) || 60000,
  playing: Number(process.env.GRACE_MS) || 180000
};
const EMOTES = ['laugh', 'wow', 'cool', 'think', 'clap', 'angry', 'skull', 'salute', 'sweat', 'heart'];
const PID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const FID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LOOPBACK = /^(127\.|::1$|localhost$)/;

const app = express();
app.set('trust proxy', true);
const cors = function (res) { res.set('Access-Control-Allow-Origin', '*'); };
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', function (req, res) { res.send('ok'); });
app.get('/stats', function (req, res) { cors(res); res.json(stats()); });
app.get('/ice', function (req, res) {
  cors(res);
  iceServers().then(function (list) { res.json({ iceServers: list }); }, function () { res.json({ iceServers: [] }); });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  // phones freeze background tabs; a long timeout stops a short app switch from counting as leaving
  pingInterval: 20000, pingTimeout: 90000, maxHttpBufferSize: 2e5
});
const rooms = new Map();      // code -> room
const sessions = new Map();   // pid -> session
const byFid = new Map();      // friend code -> session
const forming = new Set();    // public tables that are still filling up

/* ---------- voice chat: STUN + TURN ----------
   Phones on mobile data sit behind carrier NAT, where direct (STUN-only) connections often fail, so voice
   needs a TURN relay. Set TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL, or METERED_DOMAIN + METERED_API_KEY. */
let iceCache = { at: 0, list: null };
async function iceServers() {
  if (iceCache.list && Date.now() - iceCache.at < 10 * 60 * 1000) return iceCache.list;
  let list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }];
  const urls = String(process.env.TURN_URLS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  let relay = false;
  if (urls.length && process.env.TURN_USERNAME) {
    list.push({ urls: urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL || '' }); relay = true;
  } else if (process.env.METERED_API_KEY && process.env.METERED_DOMAIN) {
    try {
      const r = await fetch('https://' + process.env.METERED_DOMAIN + '/api/v1/turn/credentials?apiKey=' + encodeURIComponent(process.env.METERED_API_KEY));
      const j = await r.json();
      if (Array.isArray(j) && j.length) { list = list.concat(j); relay = true; }
    } catch (e) { console.warn('TURN fetch failed:', e.message); }
  }
  if (!relay) {
    // best-effort public relay, so voice has a chance on mobile data until you add your own TURN account
    list.push({ urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' });
  }
  iceCache = { at: Date.now(), list: list };
  return list;
}

/* ---------- helpers ---------- */
function newCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c;
  do { c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; } while (rooms.has(c));
  return c;
}
function fidOf(pid) {
  const h = crypto.createHash('sha256').update('kod:' + pid).digest();
  let s = ''; for (let i = 0; i < 7; i++) s += FID_CHARS[h[i] % FID_CHARS.length];
  return s;
}
function normFid(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
function ipOf(socket) {
  const h = socket.handshake.headers || {};
  const raw = h['cf-connecting-ip'] || h['true-client-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || socket.handshake.address || '';
  return String(raw).replace(/^::ffff:/, '');
}
const sameNet = function (a, b) { return !!a && a === b && !LOOPBACK.test(a) && !process.env.ALLOW_SAME_IP; };
function cleanText(t, max) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

function session(pid) {
  let S = sessions.get(pid);
  if (!S) {
    S = { pid: pid, fid: fidOf(pid), socket: null, name: 'Player', avatar: Presets.defaultAvatar(), ip: '', room: null, timer: null,
          friends: new Set(), inbox: { requests: {}, accepts: {}, dms: [] }, seen: Date.now(), lastChat: 0, lastEmote: 0 };
    sessions.set(pid, S); byFid.set(S.fid, S);
  }
  return S;
}
const pub = function (S) { return { fid: S.fid, name: S.name, avatar: S.avatar }; };
const memberOf = function (r, id) { return r.members.filter(function (m) { return m.id === id; })[0]; };
const humans = function (r) { return r.members.filter(function (m) { return !m.bot; }); };

function stats() {
  let searching = 0, playing = 0;
  rooms.forEach(function (r) {
    const h = humans(r).length;
    if (r.status === 'playing') playing += h; else if (r.status === 'queue') searching += h;
  });
  return { online: io.engine.clientsCount, searching: searching, playing: playing };
}
function roomState(r) {
  return {
    code: r.code, hostId: r.hostId, status: r.status, settings: r.settings,
    public: !!r.public, need: QUICK_SIZE, offerAt: r.public ? r.created + BOT_OFFER_MS : 0, now: Date.now(),
    online: r.public ? io.engine.clientsCount : 0,
    members: r.members.map(function (m) { return { id: m.id, name: m.name, avatar: m.avatar, bot: m.bot, away: !!m.away }; })
  };
}
function broadcast(r) { io.to(r.code).emit('room:state', roomState(r)); }
function addBot(r) {
  const taken = r.members.map(function (m) { return m.name; });
  const b = Presets.pickBots(1, taken)[0];
  if (!b) return;
  r.members.push({ id: 'bot-' + Math.random().toString(36).slice(2, 8), name: b.name, avatar: b.avatar, bot: true, type: b.type });
}
// two people with the same name at one table get a number, so you can tell them apart
function uniqueName(r, name, id) {
  const used = r.members.filter(function (m) { return m.id !== id; }).map(function (m) { return m.name.toLowerCase(); });
  if (used.indexOf(name.toLowerCase()) < 0) return name;
  for (let i = 2; i < 20; i++) {
    const n = name.slice(0, 14 - String(i).length - 1) + ' ' + i;
    if (used.indexOf(n.toLowerCase()) < 0) return n;
  }
  return name;
}
function closeRoom(r) {
  if (r.match) r.match.destroy();
  rooms.delete(r.code); forming.delete(r);
  r.members.forEach(function (m) { const S = byFid.get(m.id); if (S && S.room === r.code) S.room = null; });
}
function startRoom(r) {
  r.members = r.members.filter(function (m) { return m.bot || !m.away; });   // someone who is mid-reconnect in the lobby is skipped
  if (r.settings.fill) while (r.members.length < Math.min(MAX_PLAYERS, r.settings.size)) addBot(r);
  if (r.members.length < 2) return false;
  forming.delete(r);
  r.status = 'playing';
  r.match = new Match({
    players: r.members.map(function (m) { return { id: m.id, name: m.name, avatar: m.avatar, bot: m.bot, type: m.type }; }),
    hp: r.settings.hp, timer: r.settings.timer, readyTimeout: 45000, introTimeout: 25000,
    emit: function (evt, data, to) {
      if (to) io.to('p:' + to).emit('game:' + evt, data);
      else io.to(r.code).emit('game:' + evt, data);
      if (evt === 'over') {
        r.match = null;
        if (r.public) {                                   // strangers go their own way
          r.members.forEach(function (m) { const S = byFid.get(m.id); if (S && S.room === r.code) S.room = null; });
          io.in(r.code).socketsLeave(r.code); rooms.delete(r.code);
          return;
        }
        r.status = 'lobby';
        r.members = r.members.filter(function (m) { return !m.left; });
        broadcast(r);
      }
    }
  });
  broadcast(r);
  r.match.start();
  return true;
}

// take a player out of their room for good (they left, or their seat was held too long)
function exitRoom(S) {
  clearTimeout(S.timer); S.timer = null;
  const code = S.room; S.room = null;
  const r = code && rooms.get(code);
  if (S.socket && code) S.socket.leave(code);
  if (!r) return;
  const m = memberOf(r, S.fid);
  if (r.status === 'playing') {
    if (m) { m.left = true; m.away = false; m.bot = true; m.type = 'analyst'; }
    if (r.match) { if (!r.match.abandon(S.fid)) r.match.disconnect(S.fid); }
  } else {
    r.members = r.members.filter(function (x) { return x.id !== S.fid; });
  }
  if (!humans(r).length) { closeRoom(r); return; }
  if (r.hostId === S.fid) r.hostId = humans(r)[0].id;
  broadcast(r);
}
function seat(S, r) {
  let m = memberOf(r, S.fid);
  if (!m) { m = { id: S.fid, bot: false, ip: S.ip }; r.members.push(m); }
  m.name = uniqueName(r, S.name, S.fid); m.avatar = S.avatar; m.away = false; m.ip = S.ip;
  S.room = r.code;
  if (S.socket) S.socket.join(r.code);
}
function presence(S) {
  if (!S.socket) return { status: 'offline' };
  const r = S.room && rooms.get(S.room);
  if (!r) return { status: 'menu' };
  if (r.status === 'playing') return { status: 'playing' };
  if (r.public) return { status: 'queue' };
  return { status: 'lobby', code: r.code, full: r.members.length >= MAX_PLAYERS };
}
const mutual = function (A, B) { return !!B && A.friends.has(B.fid) && B.friends.has(A.fid); };

io.use(function (socket, next) {
  const a = socket.handshake.auth || {};
  let pid = String(a.pid || '');
  if (!PID_RE.test(pid)) pid = crypto.randomBytes(18).toString('base64url');
  socket.data.pid = pid; socket.data.ip = ipOf(socket);
  next();
});

io.on('connection', function (socket) {
  const S = session(socket.data.pid);
  const cur = function () { return S.socket === socket; };
  // the same browser opened twice: the newest tab takes over the seat
  if (S.socket && S.socket !== socket) { const old = S.socket; S.socket = socket; old.emit('session:replaced'); old.disconnect(true); }
  S.socket = socket; S.ip = socket.data.ip; S.seen = Date.now();
  clearTimeout(S.timer); S.timer = null;
  socket.join('p:' + S.fid);
  socket.emit('session:hello', { fid: S.fid });

  // coming back after a drop: put the player back in their seat and catch them up
  (function resume() {
    const r = S.room && rooms.get(S.room);
    if (!r) { S.room = null; socket.emit('session:state', { room: null, inMatch: false }); return; }
    const m = memberOf(r, S.fid);
    if (!m || m.left) { S.room = null; socket.emit('session:state', { room: null, inMatch: false, lost: true }); return; }
    m.away = false; socket.join(r.code);
    if (r.status === 'playing' && r.match) {
      if (r.match.reclaim(S.fid)) {
        socket.emit('session:state', { room: roomState(r), inMatch: true });
        socket.emit('game:resync', r.match.snapshot(S.fid));
      } else { S.room = null; socket.emit('session:state', { room: null, inMatch: false, lost: true }); }
    } else {
      socket.emit('session:state', { room: roomState(r), inMatch: false });
    }
    broadcast(r);
  })();

  socket.on('profile', function (d) {
    if (!cur()) return;
    S.name = Presets.cleanName(d && d.name); S.avatar = Presets.cleanAvatar(d && d.avatar);
    const r = S.room && rooms.get(S.room);
    if (r && (r.status === 'lobby' || r.status === 'queue') && memberOf(r, S.fid)) { seat(S, r); broadcast(r); }
  });

  /* ----- private rooms ----- */
  socket.on('room:create', function (d, ack) {
    if (!cur()) return;
    exitRoom(S);
    const r = { code: newCode(), hostId: S.fid, status: 'lobby', created: Date.now(), settings: { hp: 6, timer: 40, fill: true, size: 5, oneIp: false }, members: [], match: null };
    rooms.set(r.code, r); seat(S, r);
    if (typeof ack === 'function') ack({ ok: true, code: r.code, me: S.fid });
    broadcast(r);
  });

  socket.on('room:join', function (d, ack) {
    if (!cur()) return;
    const c = String(d && d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = rooms.get(c);
    const fail = function (err) { if (typeof ack === 'function') ack({ ok: false, err: err }); };
    if (!r || r.public) return fail('notfound');
    const already = memberOf(r, S.fid);
    if (r.status !== 'lobby' && !already) return fail('started');
    if (!already) {
      if (r.members.length >= MAX_PLAYERS) {
        const bot = r.members.filter(function (m) { return m.bot; })[0];
        if (!bot) return fail('full');
        r.members = r.members.filter(function (m) { return m !== bot; });
      }
      if (r.settings.oneIp && humans(r).some(function (m) { return sameNet(m.ip, S.ip); })) return fail('ip');
      exitRoom(S);
    }
    seat(S, r);
    if (typeof ack === 'function') ack({ ok: true, code: c, me: S.fid });
    broadcast(r);
  });

  const hostRoom = function () { const r = S.room && rooms.get(S.room); return r && r.hostId === S.fid ? r : null; };
  socket.on('room:addBot', function () {
    const r = hostRoom();
    if (!cur() || !r || r.status !== 'lobby' || r.members.length >= MAX_PLAYERS) return;
    addBot(r); broadcast(r);
  });
  socket.on('room:remove', function (d) {
    const r = hostRoom();
    if (!cur() || !r || r.status !== 'lobby' || !d || d.id === S.fid) return;
    const m = memberOf(r, d.id);
    if (!m) return;
    r.members = r.members.filter(function (x) { return x !== m; });
    if (!m.bot) {
      const T = byFid.get(m.id);
      if (T) { T.room = null; if (T.socket) { T.socket.leave(r.code); T.socket.emit('room:kicked'); } }
    }
    broadcast(r);
  });
  socket.on('room:settings', function (d) {
    const r = hostRoom();
    if (!cur() || !r || r.status !== 'lobby' || !d) return;
    if (HP_OPTIONS.indexOf(Number(d.hp)) >= 0) r.settings.hp = Number(d.hp);
    if (TIMER_OPTIONS.indexOf(Number(d.timer)) >= 0) r.settings.timer = Number(d.timer);
    if (typeof d.fill === 'boolean') r.settings.fill = d.fill;
    if (typeof d.oneIp === 'boolean') r.settings.oneIp = d.oneIp;
    if (SIZE_OPTIONS.indexOf(Number(d.size)) >= 0) r.settings.size = Number(d.size);
    broadcast(r);
  });
  socket.on('room:start', function (d, ack) {
    const r = hostRoom();
    const fail = function (err) { if (typeof ack === 'function') ack({ ok: false, err: err }); };
    if (!cur() || !r || r.status !== 'lobby') return fail('nothost');
    if (!startRoom(r)) { broadcast(r); return fail('needtwo'); }
    if (typeof ack === 'function') ack({ ok: true });
  });

  /* ----- Quick Match ----- */
  socket.on('quick:join', function (d, ack) {
    if (!cur()) return;
    exitRoom(S);
    // one seat per network at a public table: a second device on the same connection is put at another table
    let r = null;
    Array.from(forming).forEach(function (q) {
      if (r) return;
      if (rooms.get(q.code) !== q || q.status !== 'queue') { forming.delete(q); return; }
      if (q.members.length >= QUICK_SIZE) return;
      if (q.members.some(function (m) { return !m.bot && sameNet(m.ip, S.ip); })) return;
      r = q;
    });
    if (!r) {
      r = { code: newCode(), hostId: S.fid, status: 'queue', public: true, created: Date.now(), settings: Object.assign({}, QUICK_SETTINGS), members: [], match: null };
      rooms.set(r.code, r); forming.add(r);
    }
    seat(S, r);
    if (typeof ack === 'function') ack({ ok: true, code: r.code, me: S.fid });
    if (humans(r).length >= QUICK_SIZE) startRoom(r); else broadcast(r);
  });
  socket.on('quick:bots', function (d, ack) {
    const r = S.room && rooms.get(S.room);
    const ok = cur() && r && r.public && r.status === 'queue' && Date.now() >= r.created + BOT_OFFER_MS - 1000;
    if (typeof ack === 'function') ack({ ok: !!ok });
    if (ok) startRoom(r);
  });

  /* ----- table chat and emotes ----- */
  socket.on('chat:msg', function (d) {
    const r = S.room && rooms.get(S.room);
    if (!cur() || !r || !d) return;
    const now = Date.now(); if (now - S.lastChat < 700) return; S.lastChat = now;
    const text = cleanText(d.text, 140); if (!text) return;
    io.to(r.code).emit('chat:msg', { id: S.fid, name: S.name, text: text, t: now });
  });
  socket.on('chat:emote', function (d) {
    const r = S.room && rooms.get(S.room);
    if (!cur() || !r || !d || EMOTES.indexOf(d.e) < 0) return;
    const now = Date.now(); if (now - S.lastEmote < 900) return; S.lastEmote = now;
    io.to(r.code).emit('chat:emote', { id: S.fid, e: d.e });
  });

  /* ----- friends ----- */
  // the client tells us its friend list so we can check both sides agree before sharing presence or messages
  socket.on('friend:sync', function (d, ack) {
    if (!cur()) return;
    S.friends = new Set((Array.isArray(d && d.fids) ? d.fids : []).map(normFid).filter(Boolean).slice(0, 300));
    const inbox = {
      requests: Object.keys(S.inbox.requests).map(function (k) { return S.inbox.requests[k]; }),
      accepts: Object.keys(S.inbox.accepts).map(function (k) { return S.inbox.accepts[k]; }),
      dms: S.inbox.dms
    };
    S.inbox.accepts = {}; S.inbox.dms = [];
    if (typeof ack === 'function') ack({ ok: true, fid: S.fid, inbox: inbox });
  });
  socket.on('friend:request', function (d, ack) {
    if (!cur()) return;
    const done = function (x) { if (typeof ack === 'function') ack(x); };
    const T = byFid.get(normFid(d && d.fid));
    if (!T) return done({ ok: false, err: 'notfound' });
    if (T === S) return done({ ok: false, err: 'self' });
    if (S.friends.has(T.fid) && T.friends.has(S.fid)) return done({ ok: false, err: 'already' });
    if (Object.keys(T.inbox.requests).length > 50) return done({ ok: false, err: 'busy' });
    T.inbox.requests[S.fid] = Object.assign(pub(S), { t: Date.now() });
    if (T.socket) T.socket.emit('friend:request', T.inbox.requests[S.fid]);
    done({ ok: true, name: T.name, online: !!T.socket });
  });
  socket.on('friend:accept', function (d, ack) {
    if (!cur()) return;
    const fid = normFid(d && d.fid), T = byFid.get(fid);
    if (!T || !S.inbox.requests[fid]) { if (typeof ack === 'function') ack({ ok: false }); return; }
    delete S.inbox.requests[fid];
    S.friends.add(T.fid); T.friends.add(S.fid);
    const me = pub(S);
    if (T.socket) T.socket.emit('friend:accepted', me); else T.inbox.accepts[S.fid] = me;
    if (typeof ack === 'function') ack({ ok: true, friend: pub(T) });
  });
  socket.on('friend:decline', function (d) { if (cur() && d) delete S.inbox.requests[normFid(d.fid)]; });
  socket.on('friend:presence', function (d, ack) {
    if (!cur() || typeof ack !== 'function') return;
    const out = {};
    (Array.isArray(d && d.fids) ? d.fids : []).slice(0, 100).forEach(function (f) {
      const T = byFid.get(normFid(f));
      if (!T || !mutual(S, T)) return;
      out[T.fid] = Object.assign(presence(T), { name: T.name, avatar: T.avatar });
    });
    ack({ ok: true, presence: out });
  });
  socket.on('friend:invite', function (d, ack) {
    const r = S.room && rooms.get(S.room);
    const T = byFid.get(normFid(d && d.fid));
    const done = function (x) { if (typeof ack === 'function') ack(x); };
    if (!cur() || !r || r.public || r.status !== 'lobby') return done({ ok: false, err: 'noroom' });
    if (!T || !mutual(S, T) || !T.socket) return done({ ok: false, err: 'offline' });
    T.socket.emit('friend:invite', Object.assign(pub(S), { code: r.code }));
    done({ ok: true });
  });
  socket.on('dm:send', function (d, ack) {
    const T = byFid.get(normFid(d && d.fid));
    const text = cleanText(d && d.text, 300);
    const done = function (x) { if (typeof ack === 'function') ack(x); };
    if (!cur() || !T || !text || !mutual(S, T)) return done({ ok: false });
    const now = Date.now(); if (now - S.lastChat < 400) return done({ ok: false, err: 'slow' }); S.lastChat = now;
    const msg = { fid: S.fid, name: S.name, text: text, t: now };
    if (T.socket) T.socket.emit('dm:msg', msg);
    else { T.inbox.dms.push(msg); if (T.inbox.dms.length > 40) T.inbox.dms.shift(); }
    done({ ok: true, delivered: !!T.socket });
  });

  /* ----- voice chat signalling ----- */
  socket.on('rtc:signal', function (d) {
    const r = S.room && rooms.get(S.room);
    if (!cur() || !r || !d || typeof d.to !== 'string' || d.to === S.fid) return;
    if (!r.members.some(function (m) { return m.id === d.to && !m.bot; })) return;
    io.to('p:' + d.to).emit('rtc:signal', { from: S.fid, data: d.data });
  });
  socket.on('rtc:talk', function (d) { const r = S.room && rooms.get(S.room); if (r && cur()) socket.to(r.code).emit('rtc:talk', { id: S.fid, on: !!(d && d.on) }); });
  socket.on('rtc:mic', function (d) { const r = S.room && rooms.get(S.room); if (r && cur()) socket.to(r.code).emit('rtc:mic', { id: S.fid, on: !!(d && d.on) }); });

  /* ----- the match ----- */
  socket.on('game:pick', function (d) { const r = S.room && rooms.get(S.room); if (cur() && r && r.match) r.match.submit(S.fid, d && d.value); });
  socket.on('game:ready', function () { const r = S.room && rooms.get(S.room); if (cur() && r && r.match) r.match.ready(S.fid); });

  socket.on('room:leave', function () { if (cur()) exitRoom(S); });
  socket.on('disconnect', function () {
    if (!cur()) return;          // a newer tab already took over
    S.socket = null; S.seen = Date.now();
    const r = S.room && rooms.get(S.room);
    const m = r && memberOf(r, S.fid);
    if (!m) return;
    m.away = true;
    if (r.status === 'playing' && r.match) r.match.away(S.fid);   // a bot plays the seat meanwhile
    const grace = r.status === 'playing' ? GRACE.playing : r.status === 'queue' ? GRACE.queue : GRACE.lobby;
    clearTimeout(S.timer);
    S.timer = setTimeout(function () { if (!S.socket) exitRoom(S); }, grace);
    broadcast(r);
  });
});

// forget players who have been gone for a month
setInterval(function () {
  const old = Date.now() - 30 * 24 * 3600 * 1000;
  sessions.forEach(function (S, pid) { if (!S.socket && !S.room && S.seen < old) { sessions.delete(pid); byFid.delete(S.fid); } });
}, 3600 * 1000);
// keep everyone in a queue up to date (the online count changes)
setInterval(function () { rooms.forEach(function (r) { if (r.status === 'queue') broadcast(r); }); }, 4000);

server.listen(PORT, function () {
  console.log('King of Diamonds is running at http://localhost:' + PORT);
});
