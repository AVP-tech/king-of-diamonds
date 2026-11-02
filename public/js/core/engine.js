/* King of Diamonds: the match engine. One Match runs one game: rounds, timers, bots, eliminations.
   Solo mode runs it in the browser; online rooms run the same code on the server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules'));
  else root.KODEngine = factory(root.KODRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const BOT_TYPES = ['analyst', 'gambler', 'mimic', 'sniper'];
  // When each bot type locks in, as a share of the round timer.
  const LOCK_WINDOW = { analyst: [0.2, 0.45], gambler: [0.06, 0.18], mimic: [0.12, 0.32], sniper: [0.25, 0.55] };

  /* emit(event, data, toPlayerId?) events:
       start   { players, hp, timer }
       round   { round, alive, rules, timeMs }
       locked  { id }
       autopick{ id, value }            (only to that player)
       reveal  { round, picks, res, before, hp, eliminated, newRules, over }
       player  { id, connected, bot }
       over    { winner, standings, rounds }
     The engine waits for every connected human to send ready() after start and after each reveal. */
  function Match(o) {
    const self = this;
    this.emit = o.emit;
    this.rng = o.rng || Math.random;
    this.hp = o.hp || 6;
    this.timerMs = (o.timer || 40) * 1000;
    this.readyTimeoutMs = o.readyTimeout || 0;
    this.introTimeoutMs = o.introTimeout || 0;
    this.difficulty = o.difficulty || 'normal';
    this.players = o.players.map(function (p, i) {
      return { id: p.id, name: p.name, avatar: p.avatar, bot: !!p.bot, type: p.type || BOT_TYPES[i % 4],
               hp: self.hp, alive: true, connected: true, outRound: null };
    });
    this.startN = this.players.length;
    this.rules = R.rulesFor(this.startN, this.startN); this.crownId = null;
    this.round = 0; this.history = []; this.state = 'idle'; this.picks = {};
    this.time = 0; this.queue = []; this.paused = false; this.readySet = null; this.readyNext = null;
    let last = Date.now();
    this._iv = setInterval(function () {
      const now = Date.now(), dt = now - last; last = now;
      if (!self.paused) self.advance(dt);
    }, o.tickMs || 50);
  }
  const P = Match.prototype;

  /* virtual clock, so solo games can pause */
  P.advance = function (dt) {
    this.time += dt;
    const now = this.time;
    const due = this.queue.filter(function (q) { return q.at <= now; });
    if (!due.length) return;
    this.queue = this.queue.filter(function (q) { return q.at > now; });
    due.sort(function (a, b) { return a.at - b.at; }).forEach(function (q) { q.fn(); });
  };
  P.after = function (ms, tag, fn) { this.queue.push({ at: this.time + ms, tag: tag, fn: fn }); };
  P.cancel = function (tag) { this.queue = this.queue.filter(function (q) { return q.tag !== tag; }); };
  P.pause = function () { this.paused = true; };
  P.resume = function () { this.paused = false; };
  P.destroy = function () { clearInterval(this._iv); this.queue = []; this.state = 'done'; };

  P.get = function (id) { return this.players.filter(function (p) { return p.id === id; })[0]; };
  P.alive = function () { return this.players.filter(function (p) { return p.alive; }); };
  P.pub = function () {
    return this.players.map(function (p) {
      return { id: p.id, name: p.name, avatar: p.avatar, bot: p.bot, type: p.type, hp: p.hp, alive: p.alive, connected: p.connected };
    });
  };

  P.start = function () {
    const self = this;
    this.state = 'intro';
    this.emit('start', { players: this.pub(), hp: this.hp, timer: this.timerMs / 1000 });
    this.waitReady(this.introTimeoutMs, function () { self.startRound(); });
  };

  /* ready handshake */
  P.humansExpected = function () {
    return this.players.filter(function (p) { return !p.bot && p.connected; }).map(function (p) { return p.id; });
  };
  P.waitReady = function (timeout, next) {
    const self = this;
    this.readySet = {}; this.readyNext = next;
    this.cancel('ready');
    if (timeout) this.after(timeout, 'ready', function () { self.finishReady(); });
    this.checkReady();
  };
  P.ready = function (id) {
    if (!this.readySet) return;
    this.readySet[id] = true;
    this.checkReady();
  };
  P.checkReady = function () {
    if (!this.readySet) return;
    const set = this.readySet;
    if (this.humansExpected().every(function (id) { return set[id]; })) this.finishReady();
  };
  P.finishReady = function () {
    if (!this.readySet) return;
    this.readySet = null; this.cancel('ready');
    const n = this.readyNext; this.readyNext = null;
    if (n) n();
  };

  /* rounds */
  P.startRound = function () {
    const self = this;
    if (this.state === 'done') return;
    this.round++;
    this.state = 'pick';
    this.picks = {};
    const alive = this.alive(), n = alive.length;
    this.rules = R.rulesFor(n, this.startN);
    // Crown rule: last round's only winner, if still alive, wears the crown.
    const last = this.history[this.history.length - 1];
    this.crownId = null;
    if (this.rules.crown && last && last.winners.length === 1) {
      const w = this.get(last.winners[0]);
      if (w && w.alive) this.crownId = w.id;
    }
    alive.forEach(function (p) { if (p.bot) self.scheduleBot(p, n); });
    this.after(this.timerMs, 'pick', function () { self.timeout(); });
    this.emit('round', { round: this.round, alive: alive.map(function (p) { return p.id; }), rules: this.rules, crown: this.crownId, timeMs: this.timerMs });
  };
  P.applyDifficulty = function (v, n) {
    const r = this.rng, last = this.history[this.history.length - 1];
    if (n === 2) return v;
    if (this.difficulty === 'easy' && r() < 0.45) return R.clamp100(5 + r() * 60);
    if (this.difficulty === 'hard' && last && r() < 0.5) return R.clamp100(Math.abs(R.bestResponse(last.avg * 0.82, n) + (r() - 0.5) * 3));
    return v;
  };
  P.scheduleBot = function (p, n) {
    const self = this, alive = this.alive();
    const opp = alive.filter(function (q) { return q.id !== p.id; })[0];
    let v = R.botPick({ type: p.type }, { n: n, history: this.history, oppId: opp ? opp.id : null, rules: this.rules }, this.rng);
    v = this.applyDifficulty(v, n);
    const w = LOCK_WINDOW[p.type] || [0.1, 0.5];
    const at = Math.min(this.timerMs * (w[0] + this.rng() * (w[1] - w[0])), this.timerMs - 1500);
    this.after(Math.max(300, at), 'pick', function () { self.lock(p.id, v); });
  };
  P.submit = function (id, v) {
    if (this.state !== 'pick') return false;
    const p = this.get(id);
    if (!p || !p.alive || p.bot) return false;
    v = Number(v);
    if (!Number.isInteger(v) || v < 0 || v > 100) return false;
    return this.lock(id, v);
  };
  P.lock = function (id, v) {
    const self = this;
    if (this.state !== 'pick' || this.picks[id] !== undefined) return false;
    this.picks[id] = v;
    this.emit('locked', { id: id });
    if (this.alive().every(function (p) { return self.picks[p.id] !== undefined; })) {
      this.cancel('pick');
      this.after(500, 'pick', function () { self.reveal(); });
    }
    return true;
  };
  P.timeout = function () {
    const self = this;
    this.alive().forEach(function (p) {
      if (self.picks[p.id] !== undefined) return;
      const v = 10 + Math.floor(self.rng() * 30);
      self.picks[p.id] = v;
      self.emit('locked', { id: p.id });
      if (!p.bot) self.emit('autopick', { id: p.id, value: v }, p.id);
    });
    this.reveal();
  };
  P.reveal = function () {
    const self = this;
    if (this.state !== 'pick') return;
    this.cancel('pick');
    this.state = 'reveal';
    const alive = this.alive(), n = alive.length;
    const picks = alive.map(function (p) { return { id: p.id, pick: self.picks[p.id] }; });
    const res = R.resolveRound(picks, { rules: R.rulesFor(n, this.startN), crownId: this.crownId });
    const before = {};
    alive.forEach(function (p) { before[p.id] = p.hp; });
    R.applyResult(this.players, res);
    const eliminated = alive.filter(function (p) { return !p.alive; }).map(function (p) { p.outRound = self.round; return p.id; });
    const pm = {};
    picks.forEach(function (p) { pm[p.id] = p.pick; });
    this.history.push({ round: this.round, picks: pm, avg: res.avg, target: res.target, winners: res.winners,
                        winnerPick: res.winnerPick, voided: res.voided, bullseye: res.bullseye });
    const bef = R.rulesFor(n, this.startN), aft = R.rulesFor(this.alive().length, this.startN);
    const newRules = ['outlier', 'crown', 'lowball', 'twin', 'bullseye', 'zeroHundred'].filter(function (k) { return !bef[k] && aft[k]; });
    const st = R.matchState(this.players);
    const hp = {};
    this.players.forEach(function (p) { hp[p.id] = p.hp; });
    this.emit('reveal', { round: this.round, picks: picks, res: res, before: before, hp: hp, eliminated: eliminated, newRules: newRules, over: st.over });
    this.waitReady(this.readyTimeoutMs, function () { if (st.over) self.finish(st); else self.startRound(); });
  };
  P.finish = function (st) {
    this.state = 'over';
    const standings = this.players.slice().sort(function (a, b) {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return (b.outRound || 0) - (a.outRound || 0) || b.hp - a.hp;
    }).map(function (p) {
      return { id: p.id, name: p.name, avatar: p.avatar, bot: p.bot, alive: p.alive, outRound: p.outRound, hp: p.hp };
    });
    this.emit('over', { winner: st.winner, standings: standings, rounds: this.round });
    this.destroy();
  };

  /* a human left: a bot takes over the seat */
  P.disconnect = function (id) {
    const p = this.get(id);
    if (!p || p.bot) return;
    p.connected = false; p.bot = true; p.type = 'analyst';
    this.emit('player', { id: id, connected: false, bot: true });
    if (this.state === 'pick' && p.alive && this.picks[id] === undefined) this.scheduleBot(p, this.alive().length);    this.checkReady();
  };

  return { Match: Match, BOT_TYPES: BOT_TYPES };
});
