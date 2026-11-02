/* King of Diamonds: pure game rules, shared by the browser (solo) and the server (online rooms). */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.KODRules = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Each rule switches on when the number of living players drops to its threshold.
     Big-table rules only exist at tables that started with more players than the threshold,
     so a classic 5-player game keeps the classic four rules. */
  const RULE_AT = { outlier: 7, crown: 6, lowball: 5, twin: 4, bullseye: 3, zeroHundred: 2 };
  const BIG_RULES = ['outlier', 'crown', 'lowball'];
  const RULE_KEYS = ['core', 'twin', 'bullseye', 'zeroHundred', 'outlier', 'crown', 'lowball'];
  const MAX_PLAYERS = 8;

  const clamp100 = function (v) { return Math.max(0, Math.min(100, Math.round(v))); };
  // Best number when the other (n-1) players average m: x = 0.8 * (x + (n-1) m) / n
  const bestResponse = function (m, n) { return 0.8 * (n - 1) * m / (n - 0.8); };

  function rulesFor(n, start) {
    start = start || Math.max(n, 5);
    const r = {};
    Object.keys(RULE_AT).forEach(function (k) {
      const at = RULE_AT[k];
      r[k] = n <= at && (BIG_RULES.indexOf(k) < 0 || start > at);
    });
    return r;
  }
  // Rules that can ever appear at a table of this starting size.
  function rulesInPlay(start) {
    return RULE_KEYS.filter(function (k) { return k === 'core' || BIG_RULES.indexOf(k) < 0 || start > RULE_AT[k]; });
  }

  function endgamePick(ctx, rng) {
    const last = ctx.history[ctx.history.length - 1];
    const opp = last && ctx.oppId != null ? last.picks[ctx.oppId] : undefined;
    let p0 = 0.24, p100 = 0.18;
    if (opp !== undefined) {
      if (opp <= 2) { p0 = 0.14; p100 = 0.42; }
      else if (opp >= 95) { p0 = 0.10; p100 = 0.12; }
    }
    const r = rng();
    if (r < p0) return 0;
    if (r < p0 + p100) return 100;
    return clamp100(1 + rng() * 14);
  }

  function scatter(v, ctx, rng) {
    if (ctx.n > RULE_AT.twin) return clamp100(v);
    return clamp100(Math.abs(v + Math.floor(rng() * 5) - 2));
  }

  function botPick(bot, ctx, rng) {
    rng = rng || Math.random;
    if (ctx.n === 2) return endgamePick(ctx, rng);
    const n = ctx.n, history = ctx.history, last = history[history.length - 1];
    let x;
    if (bot.type === 'analyst') {
      let m;
      if (!last) { const k = 1 + Math.floor(rng() * 3); m = 50 * Math.pow(0.8, k); }
      else m = last.avg * (0.80 + rng() * 0.12);
      x = bestResponse(m, n) + (rng() - 0.5) * 3;
    } else if (bot.type === 'gambler') {
      const r = rng();
      x = r < 0.18 ? rng() * 100 : (r < 0.5 ? 3 + rng() * 22 : 18 + rng() * 32);
    } else if (bot.type === 'mimic') {
      if (!last) x = 24 + rng() * 18;
      else x = (last.winnerPick != null ? last.winnerPick : last.target) * (0.9 + rng() * 0.18);
    } else {
      if (history.length < 2) x = 16 + rng() * 14;
      else {
        const a = history.slice(-3).map(function (h) { return h.avg; });
        const slope = (a[a.length - 1] - a[0]) / (a.length - 1);
        const m = Math.max(0, a[a.length - 1] + slope * 0.9);
        x = bestResponse(m, n) * (0.93 + rng() * 0.08);
      }
    }
    // Under the Lowball rule, diving to the very bottom is risky.
    if (ctx.rules && ctx.rules.lowball && x < 3) x = 3 + rng() * 4;
    return scatter(x, ctx, rng);
  }

  /* picks: [{ id, pick }] for every player still alive
     opts.rules: the active rules (defaults to a classic table)
     opts.crownId: who wears the crown this round (Crown rule) */
  function resolveRound(picks, opts) {
    opts = opts || {};
    const n = picks.length;
    const rules = opts.rules || rulesFor(n);
    let crownPick, crownId = null;
    if (rules.crown && opts.crownId) {
      const c = picks.filter(function (p) { return p.id === opts.crownId; })[0];
      if (c) { crownPick = c.pick; crownId = c.id; }
    }
    const sum = picks.reduce(function (s, p) { return s + p.pick; }, 0) + (crownPick !== undefined ? crownPick : 0);
    const avg = sum / (n + (crownPick !== undefined ? 1 : 0));
    const target = 0.8 * avg;
    const dist = function (p) { return Math.abs(p.pick - target); };

    const counts = {};
    picks.forEach(function (p) { counts[p.pick] = (counts[p.pick] || 0) + 1; });
    const voided = rules.twin ? picks.filter(function (p) { return counts[p.pick] > 1; }).map(function (p) { return p.id; }) : [];
    const eligible = picks.filter(function (p) { return voided.indexOf(p.id) < 0; });

    let winners = [], special = null;
    if (rules.zeroHundred && eligible.length === 2) {
      const z = eligible.filter(function (p) { return p.pick === 0; })[0];
      const h = eligible.filter(function (p) { return p.pick === 100; })[0];
      if (z && h) { winners = [h.id]; special = 'zeroHundred'; }
    }
    if (!winners.length && eligible.length) {
      const best = Math.min.apply(null, eligible.map(dist));
      winners = eligible.filter(function (p) { return dist(p) - best < 1e-9; }).map(function (p) { return p.id; });
    }

    let winnerPick = null;
    if (winners.length === 1) winnerPick = picks.filter(function (p) { return p.id === winners[0]; })[0].pick;
    const bullseye = rules.bullseye && winnerPick !== null && special === null && winnerPick === Math.round(target);
    const penalty = bullseye ? 2 : 1;

    const deltas = {};
    picks.forEach(function (p) { deltas[p.id] = winners.indexOf(p.id) >= 0 ? 0 : -penalty; });

    // Big-table extra penalties: at most one extra point per player per round.
    const extra = {};
    if (n >= 3 && winners.length) {
      const losers = picks.filter(function (p) { return winners.indexOf(p.id) < 0; });
      if (rules.outlier && losers.length) {
        const far = Math.max.apply(null, losers.map(dist));
        losers.forEach(function (p) { if (far - dist(p) < 1e-9) extra[p.id] = 'outlier'; });
      }
      if (rules.lowball && losers.length) {
        const low = Math.min.apply(null, losers.map(function (p) { return p.pick; }));
        losers.forEach(function (p) { if (p.pick === low && !extra[p.id]) extra[p.id] = 'lowball'; });
      }
      Object.keys(extra).forEach(function (id) { deltas[id] -= 1; });
    }

    return { n: n, avg: avg, target: target, rules: rules, voided: voided, winners: winners, winnerPick: winnerPick,
             special: special, bullseye: bullseye, penalty: penalty, noWinner: winners.length === 0, deltas: deltas,
             extra: extra, crownId: crownId };
  }

  function applyResult(players, res) {
    players.forEach(function (p) {
      if (!p.alive || res.deltas[p.id] === undefined) return;
      p.hp += res.deltas[p.id];
      if (p.hp <= 0) { p.hp = 0; p.alive = false; }
    });
  }

  function matchState(players) {
    const alive = players.filter(function (p) { return p.alive; });
    const humans = alive.filter(function (p) { return !p.bot; });
    if (alive.length === 0) return { over: true, winner: null };
    if (alive.length === 1) return { over: true, winner: alive[0].id };
    if (humans.length === 0) return { over: true, winner: null, botsOnly: true };
    return { over: false, winner: null };
  }

  return { RULE_AT: RULE_AT, RULE_KEYS: RULE_KEYS, BIG_RULES: BIG_RULES, MAX_PLAYERS: MAX_PLAYERS, clamp100: clamp100,
           bestResponse: bestResponse, rulesFor: rulesFor, rulesInPlay: rulesInPlay, botPick: botPick,
           resolveRound: resolveRound, applyResult: applyResult, matchState: matchState };
});
