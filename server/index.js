/* King of Diamonds game server: serves the game and runs online rooms with Socket.IO. */
'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Match } = require('../public/js/core/engine');
const Presets = require('../public/js/core/presets');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const SIZE_OPTIONS = [5, 6, 7, 8];
const HP_OPTIONS = [4, 6, 10];
const TIMER_OPTIONS = [20, 30, 40, 60];
// Quick Match: strangers are seated together at a public table
const QUICK_SIZE = 5;                                   // a public table starts by itself at 5 real players
const QUICK_SETTINGS = { hp: 6, timer: 30, fill: true, size: 5 };
const BOT_OFFER_MS = Number(process.env.BOT_OFFER_MS) || 15000;                            // after this wait, players may start with bots

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', function (req, res) { res.send('ok'); });
app.get('/stats', function (req, res) { res.set('Access-Control-Allow-Origin', '*'); res.json(stats()); });

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();
let forming = null; // the public table currently filling up

function stats() {
  let searching = 0, playing = 0;
  rooms.forEach(function (r) {
    const h = r.members.filter(function (m) { return !m.bot; }).length;
    if (r.status === 'playing') playing += h; else if (r.status === 'queue') searching += h;
  });
  return { online: io.engine.clientsCount, searching: searching, playing: playing };
}

function newCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c;
  do { c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; } while (rooms.has(c));
  return c;
}
function roomState(r) {
  return {
    code: r.code, hostId: r.hostId, status: r.status, settings: r.settings,
    public: !!r.public, need: QUICK_SIZE, offerAt: r.public ? r.created + BOT_OFFER_MS : 0, now: Date.now(),
    online: r.public ? io.engine.clientsCount : 0,
    members: r.members.map(function (m) { return { id: m.id, name: m.name, avatar: m.avatar, bot: m.bot }; })
  };
}
function broadcast(r) { io.to(r.code).emit('room:state', roomState(r)); }
function addBot(r) {
  const taken = r.members.map(function (m) { return m.name; });
  const b = Presets.pickBots(1, taken)[0];
  if (!b) return;
  r.members.push({ id: 'bot-' + Math.random().toString(36).slice(2, 8), name: b.name, avatar: b.avatar, bot: true, type: b.type });
}
function closeRoom(r) { if (r.match) r.match.destroy(); rooms.delete(r.code); if (forming === r) forming = null; }
function startRoom(r) {
  if (r.settings.fill) while (r.members.length < Math.min(MAX_PLAYERS, r.settings.size)) addBot(r);
  if (r.members.length < 2) return false;
  if (forming === r) forming = null;
  r.status = 'playing';
  r.match = new Match({
    players: r.members.map(function (m) { return { id: m.id, name: m.name, avatar: m.avatar, bot: m.bot, type: m.type }; }),
    hp: r.settings.hp, timer: r.settings.timer, readyTimeout: 45000, introTimeout: 25000,
    emit: function (evt, data, to) {
      if (to) io.to(to).emit('game:' + evt, data);
      else io.to(r.code).emit('game:' + evt, data);
      if (evt === 'over') {
        r.match = null;
        if (r.public) { io.in(r.code).socketsLeave(r.code); rooms.delete(r.code); return; }  // strangers go their own way
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
// keep everyone in the queue up to date (the online count changes)
setInterval(function () { rooms.forEach(function (r) { if (r.status === 'queue') broadcast(r); }); }, 4000);

io.on('connection', function (socket) {
  let profile = { name: 'Player', avatar: Presets.defaultAvatar() };
  let code = null;
  const room = function () { return code ? rooms.get(code) : null; };
  const isHost = function (r) { return r && r.hostId === socket.id; };

  socket.on('profile', function (d) {
    profile = { name: Presets.cleanName(d && d.name), avatar: Presets.cleanAvatar(d && d.avatar) };
    const r = room();
    if (r && (r.status === 'lobby' || r.status === 'queue')) {
      const m = r.members.filter(function (x) { return x.id === socket.id; })[0];
      if (m) { m.name = profile.name; m.avatar = profile.avatar; broadcast(r); }
    }
  });

  socket.on('room:create', function (d, ack) {
    leave();
    const r = { code: newCode(), hostId: socket.id, status: 'lobby', settings: { hp: 6, timer: 40, fill: true, size: 5 },
                members: [{ id: socket.id, name: profile.name, avatar: profile.avatar, bot: false }], match: null };
    rooms.set(r.code, r);
    socket.join(r.code); code = r.code;
    if (typeof ack === 'function') ack({ ok: true, code: r.code, me: socket.id });
    broadcast(r);
  });

  socket.on('room:join', function (d, ack) {
    const c = String(d && d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = rooms.get(c);
    const fail = function (err) { if (typeof ack === 'function') ack({ ok: false, err: err }); };
    if (!r) return fail('notfound');
    if (r.status !== 'lobby') return fail('started');
    if (r.members.length >= MAX_PLAYERS) {
      const bot = r.members.filter(function (m) { return m.bot; })[0];
      if (!bot) return fail('full');
      r.members = r.members.filter(function (m) { return m !== bot; });
    }
    leave();
    r.members.push({ id: socket.id, name: profile.name, avatar: profile.avatar, bot: false });
    socket.join(c); code = c;
    if (typeof ack === 'function') ack({ ok: true, code: c, me: socket.id });
    broadcast(r);
  });

  socket.on('room:addBot', function () {
    const r = room();
    if (!isHost(r) || r.status !== 'lobby' || r.members.length >= MAX_PLAYERS) return;
    addBot(r); broadcast(r);
  });

  socket.on('room:remove', function (d) {
    const r = room();
    if (!isHost(r) || r.status !== 'lobby' || !d || d.id === socket.id) return;
    const m = r.members.filter(function (x) { return x.id === d.id; })[0];
    if (!m) return;
    r.members = r.members.filter(function (x) { return x !== m; });
    if (!m.bot) {
      const s = io.sockets.sockets.get(m.id);
      if (s) { s.leave(r.code); s.emit('room:kicked'); }
    }
    broadcast(r);
  });

  socket.on('room:settings', function (d) {
    const r = room();
    if (!isHost(r) || r.status !== 'lobby' || !d) return;
    if (HP_OPTIONS.indexOf(Number(d.hp)) >= 0) r.settings.hp = Number(d.hp);
    if (TIMER_OPTIONS.indexOf(Number(d.timer)) >= 0) r.settings.timer = Number(d.timer);
    if (typeof d.fill === 'boolean') r.settings.fill = d.fill;
    if (SIZE_OPTIONS.indexOf(Number(d.size)) >= 0) r.settings.size = Number(d.size);
    broadcast(r);
  });

  socket.on('room:start', function (d, ack) {
    const r = room();
    const fail = function (err) { if (typeof ack === 'function') ack({ ok: false, err: err }); };
    if (!isHost(r) || r.status !== 'lobby') return fail('nothost');
    if (!startRoom(r)) return fail('needtwo');
    if (typeof ack === 'function') ack({ ok: true });
  });

  /* ---------- Quick Match ---------- */
  socket.on('quick:join', function (d, ack) {
    leave();
    let r = forming && rooms.get(forming.code) === forming && forming.status === 'queue' && forming.members.length < QUICK_SIZE ? forming : null;
    if (!r) {
      r = { code: newCode(), hostId: socket.id, status: 'queue', public: true, created: Date.now(), settings: Object.assign({}, QUICK_SETTINGS), members: [], match: null };
      rooms.set(r.code, r); forming = r;
    }
    r.members.push({ id: socket.id, name: profile.name, avatar: profile.avatar, bot: false });
    socket.join(r.code); code = r.code;
    if (typeof ack === 'function') ack({ ok: true, code: r.code, me: socket.id });
    if (r.members.filter(function (m) { return !m.bot; }).length >= QUICK_SIZE) startRoom(r);
    else broadcast(r);
  });
  // anyone at a filling table may start it with bots once the short wait is over
  socket.on('quick:bots', function (d, ack) {
    const r = room();
    const ok = r && r.public && r.status === 'queue' && Date.now() >= r.created + BOT_OFFER_MS - 1000;
    if (typeof ack === 'function') ack({ ok: !!ok });
    if (ok) startRoom(r);
  });

  // voice chat: pass WebRTC connection messages between players in the same room
  socket.on('rtc:signal', function (d) {
    const r = room();
    if (!r || !d || typeof d.to !== 'string' || d.to === socket.id) return;
    if (!r.members.some(function (m) { return m.id === d.to && !m.bot; })) return;
    io.to(d.to).emit('rtc:signal', { from: socket.id, data: d.data });
  });
  socket.on('rtc:talk', function (d) { const r = room(); if (r) socket.to(r.code).emit('rtc:talk', { id: socket.id, on: !!(d && d.on) }); });
  socket.on('rtc:mic', function (d) { const r = room(); if (r) socket.to(r.code).emit('rtc:mic', { id: socket.id, on: !!(d && d.on) }); });

  socket.on('game:pick', function (d) { const r = room(); if (r && r.match) r.match.submit(socket.id, d && d.value); });
  socket.on('game:ready', function () { const r = room(); if (r && r.match) r.match.ready(socket.id); });
  socket.on('room:leave', function () { leave(); });
  socket.on('disconnect', function () { leave(); });

  function leave() {
    const r = room();
    if (code) socket.leave(code);
    code = null;
    if (!r) return;
    if (r.status === 'playing') {
      const m = r.members.filter(function (x) { return x.id === socket.id; })[0];
      if (m) { m.left = true; m.bot = true; m.type = 'analyst'; }
      if (r.match) r.match.disconnect(socket.id);
    } else {
      r.members = r.members.filter(function (x) { return x.id !== socket.id; });
    }
    const humans = r.members.filter(function (m) { return !m.bot; });
    if (!humans.length) { closeRoom(r); return; }
    if (r.hostId === socket.id) r.hostId = humans[0].id;
    broadcast(r);
  }
});

server.listen(PORT, function () {
  console.log('King of Diamonds is running at http://localhost:' + PORT);
});
