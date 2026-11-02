/* King of Diamonds: avatar options, preset faces and bot roster. Shared by browser and server. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.KODPresets = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OPT = {
    skin: ['#F5D9C5', '#E9BE9C', '#D9A27A', '#B9805A', '#9A643F', '#7A4A2C', '#5A3420', '#3F2416'],
    face: ['oval', 'round', 'long'],
    hair: ['bob', 'short', 'slick', 'pulled', 'long', 'curly', 'buzz', 'mohawk', 'bald'],
    hairColor: ['#16161D', '#3A2416', '#6B4226', '#A0522D', '#D9A55B', '#E8E0D0', '#C4532F', '#4D63D6', '#D24E93'],
    head: ['none', 'beanie', 'cap', 'band'],
    eyes: ['#4A2F1F', '#2A1A10', '#4F7A3C', '#3C6E9E', '#7A5A2A', '#5E5E6E'],
    eyewear: ['none', 'glasses', 'shades'],
    facial: ['none', 'mustache', 'stubble', 'beard'],
    neck: ['none', 'bowtie', 'chain', 'headphones'],
    outfit: ['blazer', 'hoodie', 'vest', 'jacket', 'tee'],
    outfitColor: ['#1D5A63', '#3E4C2E', '#563585', '#2A2F3B', '#7A1F2B', '#1F3A6E', '#B5651D', '#2B2B2B', '#C9C2B4'],
    accent: ['#3FD1C6', '#FF8A3D', '#B48CFF', '#FF5C7A', '#7FA8FF', '#FFC54A', '#3EE08F', '#FF7AD9']
  };
  const INDEXED = ['skin', 'hairColor', 'eyes', 'outfitColor', 'accent'];
  const NAMED = ['face', 'hair', 'head', 'eyewear', 'facial', 'neck', 'outfit'];

  function av(skin, face, hair, hairColor, head, eyes, eyewear, facial, neck, outfit, outfitColor, accent) {
    return { skin: skin, face: face, hair: hair, hairColor: hairColor, head: head, eyes: eyes, eyewear: eyewear,
             facial: facial, neck: neck, outfit: outfit, outfitColor: outfitColor, accent: accent };
  }

  const PRESETS = [
    { name: 'Vesper', type: 'analyst', avatar: av(1, 'oval', 'bob', 0, 'none', 0, 'glasses', 'none', 'none', 'blazer', 0, 0) },
    { name: 'Kilo', type: 'gambler', avatar: av(3, 'round', 'buzz', 1, 'beanie', 1, 'none', 'stubble', 'chain', 'hoodie', 1, 1) },
    { name: 'Marlow', type: 'mimic', avatar: av(0, 'long', 'slick', 1, 'none', 2, 'none', 'mustache', 'bowtie', 'vest', 2, 2) },
    { name: 'Ines', type: 'sniper', avatar: av(4, 'oval', 'pulled', 0, 'none', 1, 'none', 'none', 'headphones', 'jacket', 3, 3) },
    { name: 'Rook', type: 'gambler', avatar: av(5, 'round', 'mohawk', 0, 'none', 1, 'shades', 'beard', 'chain', 'jacket', 7, 5) },
    { name: 'Juno', type: 'mimic', avatar: av(0, 'oval', 'curly', 6, 'band', 3, 'none', 'none', 'none', 'tee', 5, 6) },
    { name: 'Dex', type: 'sniper', avatar: av(2, 'long', 'short', 2, 'cap', 4, 'none', 'none', 'headphones', 'hoodie', 6, 4) },
    { name: 'Sana', type: 'analyst', avatar: av(2, 'oval', 'long', 0, 'none', 0, 'glasses', 'none', 'none', 'blazer', 4, 7) },
    { name: 'Bodhi', type: 'analyst', avatar: av(6, 'round', 'bald', 0, 'none', 1, 'none', 'beard', 'none', 'tee', 8, 5) },
    { name: 'Mira', type: 'sniper', avatar: av(7, 'oval', 'bob', 4, 'none', 3, 'shades', 'none', 'chain', 'jacket', 4, 3) },
    { name: 'Tenzin', type: 'mimic', avatar: av(1, 'round', 'short', 0, 'band', 0, 'none', 'none', 'none', 'hoodie', 2, 6) },
    { name: 'Ozzy', type: 'gambler', avatar: av(3, 'long', 'curly', 7, 'none', 2, 'glasses', 'mustache', 'bowtie', 'vest', 0, 1) }
  ];

  function clone(a) { return JSON.parse(JSON.stringify(a)); }
  function defaultAvatar() { return clone(PRESETS[10].avatar); }
  function randomAvatar(rng) {
    rng = rng || Math.random;
    const a = {};
    INDEXED.forEach(function (k) { a[k] = Math.floor(rng() * OPT[k].length); });
    NAMED.forEach(function (k) { a[k] = OPT[k][Math.floor(rng() * OPT[k].length)]; });
    if (rng() < 0.55) a.head = 'none';
    if (rng() < 0.5) a.eyewear = 'none';
    if (rng() < 0.5) a.facial = 'none';
    return a;
  }
  function cleanAvatar(a) {
    const d = defaultAvatar(), out = {};
    a = a && typeof a === 'object' ? a : {};
    INDEXED.forEach(function (k) {
      const v = Number(a[k]);
      out[k] = Number.isInteger(v) && v >= 0 && v < OPT[k].length ? v : d[k];
    });
    NAMED.forEach(function (k) { out[k] = OPT[k].indexOf(a[k]) >= 0 ? a[k] : d[k]; });
    return out;
  }
  function cleanName(n) {
    n = String(n == null ? '' : n).replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
    return n || 'Player';
  }
  // Bots for a table, skipping names already in use.
  function pickBots(count, taken, rng) {
    rng = rng || Math.random;
    const pool = PRESETS.filter(function (p) { return (taken || []).indexOf(p.name) < 0; });
    const head = pool.slice(0, 4), tail = pool.slice(4);
    for (let i = tail.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = tail[i]; tail[i] = tail[j]; tail[j] = t; }
    return head.concat(tail).slice(0, count).map(function (p) { return { name: p.name, type: p.type, avatar: clone(p.avatar) }; });
  }

  return { OPT: OPT, PRESETS: PRESETS, defaultAvatar: defaultAvatar, randomAvatar: randomAvatar, cleanAvatar: cleanAvatar,
           cleanName: cleanName, pickBots: pickBots };
});
