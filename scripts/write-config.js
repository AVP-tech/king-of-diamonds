/* Runs on Vercel at build time: writes public/config.js from the SERVER_URL environment variable,
   so the site knows where the multiplayer server (on Render) lives. */
'use strict';
const fs = require('fs');
const path = require('path');
const url = String(process.env.SERVER_URL || '').trim().replace(/\/+$/, '');
const file = path.join(__dirname, '..', 'public', 'config.js');
fs.writeFileSync(file, '/* written at build time by scripts/write-config.js */\nwindow.KOD_SERVER = ' + JSON.stringify(url) + ';\n');
console.log(url ? 'Game server: ' + url : 'SERVER_URL not set: online play will use the same address as the site.');
