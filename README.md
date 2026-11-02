# King of Diamonds

A 3D round-table survival number game for 5 to 8 players, playable in the browser. Every round, each player secretly picks a whole number from 0 to 100. The average is multiplied by 0.8, and the closest pick wins the round. Everyone else loses a diamond. At 0 diamonds you are eliminated and a new rule enters the game. The last player standing wins.

## What's inside

- **Landing page**: a live 3D card room plays a round by itself behind the menu, followed by How it works, the rules, features, a FAQ and a footer with About, Privacy and Terms pages (AdSense requires a privacy policy).
- **Quick match**: real players from anywhere are seated at a public table. It starts as soon as 5 players are there. After 15 seconds of waiting, anyone at the table can tap **Start with bots** and bots take the empty seats.
- **Play vs bots**: offline practice against bots at a 5, 6, 7 or 8 seat table, with difficulty, match length and timer options.
- **Rooms**: create a room, share the 5-letter code or link, choose the table size, fill seats with bots and play with friends.
- **3D card room** (Three.js): wooden round table, hanging lamps, shadows, characters who react, think, smirk and panic.
- **Free look**: drag with the mouse or a finger to turn your head. A / D and W / S (or the arrow keys) also work. Double-tap, press C or use the target button to look ahead again.
- **Your elimination, seen from outside**: the red dot crawls onto you, then the camera cuts across the table to show your own character in your chair. The turret drops, the laser locks on, and the shot plays in slow motion. Then the camera rises over the table in black and white as the others react. Tap to skip. The **No blood** setting removes the blood.
- **Other eliminations**: the turret drops over the player, the camera swings onto them, and one shot.
- **Recorded announcer** in English and Hindi. Lines are stitched together live, for example "The average is" + "twenty-six" + "point" + "four".
- **Voice chat** in online games: tap the mic button to talk. The mic is off until you turn it on.
- **Music**: a swing theme in the menus and a quieter, tense theme at the table that speeds up in the last 10 seconds.
- **Avatar creator**: 12 ready-made characters plus full customisation. Your hands and 3D body match your avatar.
- **Rulebook** with voice reading in English or Hindi.

## Rules

Classic rules (every table):
1. **The 80% rule**: closest to 80% of the average wins; everyone else loses 1 HP.
2. **Twin rule** (4 players left): matching numbers are void.
3. **Bullseye rule** (3 left): hitting the rounded target exactly costs everyone else 2 HP.
4. **Hundred beats zero** (2 left): 100 beats 0.

Big-table rules (only at tables that started with more players):
5. **Outlier rule** (7 left): the pick farthest from the target loses 1 extra HP.
6. **Crown rule** (6 left): last round's only winner wears the crown and their number counts twice in the average.
7. **Lowball rule** (5 left): the lowest number loses 1 extra HP unless it wins.

A player never loses more than 1 extra HP per round from rules 5 and 7.

## Run it on your Mac

You need Node.js 18 or newer. Check with `node -v`.

```bash
cd ~/Desktop/"King of Diamonds"
npm install
npm start
```

Then open **http://localhost:3000**. Everything works locally, including Quick match (open two browser windows to see two players meet).

Play vs bots also works without the server: double-click `public/index.html`.

## Put it on the internet

The game has two parts:

| Part | What it is | Where it goes |
|---|---|---|
| Website | everything in `public/` (landing page, 3D game, bots mode) | **Vercel** |
| Game server | `server/index.js` (Quick match, rooms, voice chat connection) | **Render** |

Vercel can't run the game server. Vercel runs short serverless functions, and the server has to keep a live connection (WebSocket) open for the whole match. So the server goes on Render, which has a free plan for this.

### Step 1: Render (game server)

1. Go to [render.com](https://render.com) and sign in with GitHub.
2. **New → Blueprint**, pick this repository. Render reads `render.yaml` and sets everything up (free plan, `npm install`, `npm start`).
   (Or **New → Web Service**: runtime Node, build `npm install`, start `npm start`, health check path `/healthz`.)
3. When it is live, copy its address, for example `https://king-of-diamonds.onrender.com`. Opening `/healthz` on it should show `ok`.

The free plan sleeps after 15 minutes without visitors. The first player after that waits up to a minute while it wakes. The game shows "Waking up the game server" during that time, and the landing page pings the server as soon as someone opens it, so it is usually awake by the time they tap Quick match. A paid Render plan ($7/month) never sleeps.

### Step 2: Vercel (website)

1. Go to [vercel.com](https://vercel.com), **Add New → Project**, import this repository.
2. Leave Framework as **Other**. `vercel.json` already sets the build (`node scripts/write-config.js`) and the output folder (`public`).
3. Under **Environment Variables** add `SERVER_URL` = your Render address from step 1 (no slash at the end).
4. Deploy. If you change `SERVER_URL` later, redeploy so it takes effect.

Without Vercel you can also use only Render: the server serves the website too, so the Render address alone is a complete working game.

### Custom domain

Add your domain in Vercel (Project → Settings → Domains). The game server can stay on its `onrender.com` address.

### Ads (AdSense)

1. Put the site on your own domain first. AdSense approves domains, not `vercel.app` addresses.
2. Replace `hello@example.com` in `public/about.html`, `public/privacy.html` and `public/terms.html` and in the landing page footer (`public/index.html`, `id="footMail"`) with your real contact email.
3. Apply at [adsense.google.com](https://adsense.google.com). Google gives you a script tag for the `<head>` of `public/index.html` and an `ads.txt` file, which goes in `public/`.
4. Good ad spots: between the landing page sections, below the FAQ, and on the end-of-match screen. Don't put ads on the table during a round.
5. For visitors in Europe and the UK, turn on Google's consent message (AdSense → Privacy & messaging).

## Voice chat notes

- Browsers allow the microphone only on **https** pages or on **localhost**. Vercel and Render both give you https.
- Voice chat is peer-to-peer and uses Google's free STUN servers. Some strict office or college networks block that; adding a TURN server (for example a free Metered TURN account) fixes it.

## Credits

- 3D: [Three.js](https://threejs.org) r158, MIT licence (`public/vendor/three.min.js`)
- Realtime: [Socket.IO](https://socket.io) 4.8, MIT licence (`public/vendor/socket.io.min.js`)
- Announcer voice: generated with [Kokoro-82M](https://github.com/hexgrad/kokoro) (Apache 2.0) through kokoro-onnx, voices `am_michael` (English) and `hm_omega` (Hindi). Clips are in `public/audio/voice/`.

## Project layout

```
server/index.js           Game server: Quick match queue, rooms, matches, voice chat signalling
public/index.html         Landing page and all game screens
public/about.html         About page
public/privacy.html       Privacy policy (needed for AdSense)
public/terms.html         Terms of use
public/config.js          Address of the game server (written by the Vercel build)
public/css/style.css      All styles and animations
public/js/core/rules.js   Game rules (shared by browser and server)
public/js/core/engine.js  Match engine: rounds, timers, bots, eliminations (shared)
public/js/core/presets.js Avatar options, preset faces, bot roster (shared)
public/js/scene.js        3D room, characters, free look, executions, cinematic camera, landing attract mode
public/js/game.js         In-game flow and effects
public/js/ui.js           Landing, menus, Quick match, avatar creator, rulebook, settings, rooms
public/js/net.js          Connection to the game server
public/js/voicechat.js    Online voice chat (WebRTC)
public/js/announcer.js    Recorded announcer playback
public/js/avatar.js       Cartoon avatar drawing
public/js/audio.js        Sound effects, music, voice host
public/js/fx.js           Particles and the 2D menu background
public/js/i18n.js         English and Hindi text
public/audio/voice/       Announcer clips, English and Hindi
scripts/write-config.js   Vercel build step
vercel.json               Vercel settings
render.yaml               Render settings
```

## Notes

- "King of Diamonds" is also the name of a game in the Netflix series *Alice in Borderland*. The characters, art and extra rules here are original, but check the name before a big commercial launch.
