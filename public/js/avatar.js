/* King of Diamonds: cartoon avatar renderer. One config draws a seated player, a bust portrait or a small head. */
(function () {
  'use strict';
  const K = window.KOD = window.KOD || {};
  const OPT = window.KODPresets.OPT;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f); }
    else { r = Math.round(r + (255 - r) * (f - 1)); g = Math.round(g + (255 - g) * (f - 1)); b = Math.round(b + (255 - b) * (f - 1)); }
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  const FACE = { oval: [39, 49], round: [45, 50], long: [37, 52] };

  function colors(a) {
    const skin = OPT.skin[a.skin] || OPT.skin[1];
    return {
      skin: skin, shade: shade(skin, 0.8), hair: OPT.hairColor[a.hairColor] || '#16161D', iris: OPT.eyes[a.eyes] || '#4A2F1F',
      outfit: OPT.outfitColor[a.outfitColor] || '#1D5A63', accent: OPT.accent[a.accent] || '#3FD1C6'
    };
  }
  K.accentOf = function (a) { return colors(a || {}).accent; };
  K.avatarColors = function (a) { return colors(a || {}); };
  K.shade = shade;
  K.skinOf = function (a) { return colors(a || {}).skin; };
  K.outfitOf = function (a) { return colors(a || {}).outfit; };

  /* hair: returns { back, front } drawn for a 40-wide head, then scaled to the face width */
  function hair(a, c) {
    const h = c.hair;
    switch (a.hair) {
      case 'bob': return {
        back: '<path d="M-51 -140 C-62 -262 62 -262 51 -140 Q42 -134 35 -142 L-35 -142 Q-42 -134 -51 -140Z" fill="' + h + '"/>',
        front: '<path d="M-42 -186 C-48 -246 48 -246 42 -186 L41 -212 Q20 -217 0 -216 Q-20 -217 -41 -212 Z" fill="' + h + '"/><path d="M-26 -236 Q0 -246 24 -238" stroke="rgba(255,255,255,.15)" stroke-width="3" fill="none" stroke-linecap="round"/>' };
      case 'short': return {
        back: '',
        front: '<path d="M-42 -192 C-46 -252 44 -256 42 -192 C38 -206 34 -214 26 -220 L20 -211 L14 -223 L4 -213 L-4 -225 L-12 -213 L-22 -223 L-30 -211 C-36 -205 -40 -198 -42 -192Z" fill="' + h + '"/>' };
      case 'slick': return {
        back: '',
        front: '<path d="M-38 -196 C-46 -252 38 -260 40 -200 C36 -222 20 -232 0 -230 C-12 -229 -26 -222 -30 -212 C-33 -206 -36 -200 -38 -196Z" fill="' + h + '"/><path d="M-10 -232 C6 -238 26 -230 34 -214" stroke="rgba(255,255,255,.22)" stroke-width="2" fill="none"/>' };
      case 'pulled': return {
        back: '<path d="M-44 -170 C-52 -254 52 -254 44 -170 Z" fill="' + h + '"/>',
        front: '<path d="M-41 -196 C-42 -248 42 -248 41 -196 C30 -222 8 -228 -2 -226 C-14 -226 -32 -218 -41 -196Z" fill="' + h + '"/>' };
      case 'long': return {
        back: '<path d="M-52 -112 C-66 -268 66 -268 52 -112 L38 -110 L38 -168 L-38 -168 L-38 -110 Z" fill="' + h + '"/>',
        front: '<path d="M-42 -182 C-48 -252 46 -252 42 -182 C40 -210 22 -226 -6 -224 C-20 -216 -34 -204 -42 -182Z" fill="' + h + '"/>' };
      case 'curly': {
        let f = '';
        for (let i = 0; i <= 9; i++) {
          const th = Math.PI * (1.04 + 0.92 * i / 9);
          f += '<circle cx="' + (43 * Math.cos(th)).toFixed(1) + '" cy="' + (-192 + 50 * Math.sin(th)).toFixed(1) + '" r="13" fill="' + h + '"/>';
        }
        return { back: '<ellipse cx="0" cy="-200" rx="50" ry="54" fill="' + h + '"/><circle cx="-46" cy="-166" r="12" fill="' + h + '"/><circle cx="46" cy="-166" r="12" fill="' + h + '"/>', front: f };
      }
      case 'buzz': return { back: '', front: '<path d="M-41 -196 C-42 -246 42 -246 41 -196 C28 -214 -28 -214 -41 -196Z" fill="' + h + '" opacity=".6"/>' };
      case 'mohawk': return {
        back: '',
        front: '<path d="M-41 -196 C-42 -246 42 -246 41 -196 C28 -214 -28 -214 -41 -196Z" fill="' + h + '" opacity=".25"/><path d="M-9 -206 L-12 -262 L-4 -248 L0 -272 L4 -248 L12 -262 L9 -206 Z" fill="' + h + '"/>' };
      default: return { back: '', front: '<ellipse cx="-14" cy="-226" rx="12" ry="5" fill="#fff" opacity=".18" transform="rotate(-20 -14 -226)"/>' };
    }
  }
  function headwear(a, c) {
    const acc = c.accent, o = c.outfit;
    switch (a.head) {
      case 'beanie': {
        const col = shade(acc, 0.75), dk = shade(acc, 0.55);
        return '<path d="M-48 -208 C-52 -272 52 -272 48 -208 Z" fill="' + col + '"/><path d="M-30 -254 L-30 -222 M-15 -262 L-15 -222 M0 -264 L0 -222 M15 -262 L15 -222 M30 -254 L30 -222" stroke="' + dk + '" stroke-width="2.5" opacity=".75"/><rect x="-50" y="-224" width="100" height="18" rx="8" fill="' + dk + '"/><circle cx="0" cy="-268" r="7" fill="' + col + '"/>';
      }
      case 'cap': {
        const col = shade(o, 1.15);
        return '<path d="M-44 -206 C-46 -262 46 -262 44 -206 Z" fill="' + col + '"/><path d="M-44 -208 Q-6 -218 56 -204 Q64 -199 55 -194 Q0 -204 -44 -200Z" fill="' + shade(col, 0.75) + '"/><circle cx="0" cy="-258" r="4" fill="' + shade(col, 0.7) + '"/><path d="M-8 -250 L8 -250 L0 -236Z" fill="' + acc + '"/>';
      }
      case 'band': return '<path d="M-41 -216 Q0 -232 41 -216 L41 -205 Q0 -221 -41 -205Z" fill="' + acc + '"/>';
      default: return '';
    }
  }
  function eyewear(a) {
    if (a.eyewear === 'glasses') return '<g fill="rgba(200,230,235,.08)" stroke="#C7D7DB" stroke-width="2"><rect x="-27" y="-199" width="22" height="17" rx="6"/><rect x="5" y="-199" width="22" height="17" rx="6"/></g><path d="M-5 -192 Q0 -195 5 -192" stroke="#C7D7DB" stroke-width="2" fill="none"/>';
    if (a.eyewear === 'shades') return '<g fill="#0B0F12" stroke="#2A3238" stroke-width="1.5"><path d="M-30 -199 L-4 -199 L-6 -186 Q-17 -180 -28 -187 Z"/><path d="M4 -199 L30 -199 L28 -187 Q17 -180 6 -186 Z"/></g><path d="M-4 -197 L4 -197" stroke="#2A3238" stroke-width="2.5"/><path d="M-26 -196 L-18 -196" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/><path d="M8 -196 L16 -196" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>';
    return '';
  }
  function facialUnder(a, c) {
    if (a.facial === 'stubble') return '<path d="M-42 -182 Q-40 -140 0 -136 Q40 -140 42 -182 Q24 -160 0 -160 Q-24 -160 -42 -182Z" fill="' + c.hair + '" opacity=".3"/>';
    if (a.facial === 'beard') return '<path d="M-41 -186 Q-42 -130 0 -124 Q42 -130 41 -186 Q36 -160 20 -156 Q0 -166 -20 -156 Q-36 -160 -41 -186Z" fill="' + c.hair + '"/>';
    return '';
  }
  function facialOver(a, c) {
    if (a.facial === 'mustache') return '<path d="M-14 -167 Q-7 -173 0 -168 Q7 -173 14 -167 Q18 -164 22 -169 Q16 -160 7 -164 Q0 -162 -7 -164 Q-16 -160 -22 -169 Q-18 -164 -14 -167Z" fill="' + c.hair + '"/>';
    if (a.facial === 'beard') return '<path d="M-13 -166 Q0 -172 13 -166 Q8 -162 0 -164 Q-8 -162 -13 -166Z" fill="' + c.hair + '"/>';
    return '';
  }
  function outfit(a, c) {
    const o = c.outfit, d = shade(o, 0.72);
    const r = { back: '', torso: o, extra: '', sleeve: o };
    switch (a.outfit) {
      case 'blazer':
        r.extra = '<path d="M-20 -127 L0 -84 L20 -127 Z" fill="#E6ECEE"/><path d="M-46 -124 L-20 -127 L-4 -80 L-24 -60 Z" fill="' + d + '"/><path d="M46 -124 L20 -127 L4 -80 L24 -60 Z" fill="' + d + '"/><path d="M-50 -92 L-34 -92 L-36 -86 L-48 -86Z" fill="' + c.accent + '"/>';
        break;
      case 'hoodie':
        r.back = '<path d="M-58 -118 Q-42 -154 0 -154 Q42 -154 58 -118 Q0 -128 -58 -118Z" fill="' + shade(o, 0.82) + '"/>';
        r.extra = '<path d="M-12 -122 L-14 -90 M12 -122 L14 -90" stroke="#D9D2BE" stroke-width="2.5" stroke-linecap="round"/><path d="M-40 -40 Q0 -30 40 -40 L42 10 L-42 10Z" fill="#000" opacity=".14"/>';
        break;
      case 'vest':
        r.torso = '#EFEBE4'; r.sleeve = '#E3DED6';
        r.extra = '<path d="M-72 44 L-72 -98 Q-68 -114 -40 -122 L-20 -126 L0 -70 L20 -126 L40 -122 Q68 -114 72 -98 L72 44Z" fill="' + o + '"/><circle cx="0" cy="-50" r="2.6" fill="#E8B931"/><circle cx="0" cy="-30" r="2.6" fill="#E8B931"/><circle cx="0" cy="-10" r="2.6" fill="#E8B931"/>';
        break;
      case 'jacket':
        r.extra = '<path d="M0 -122 L0 44" stroke="' + shade(o, 1.35) + '" stroke-width="2.5"/><path d="M-32 -126 L-10 -104 L-4 -126Z" fill="' + d + '"/><path d="M32 -126 L10 -104 L4 -126Z" fill="' + d + '"/>';
        break;
      default:
        r.extra = '<path d="M-20 -126 Q0 -108 20 -126" stroke="' + d + '" stroke-width="4" fill="none"/><path d="M-30 -60 L-10 -60" stroke="' + c.accent + '" stroke-width="4" stroke-linecap="round"/>';
    }
    if (a.hair === 'pulled') {
      for (let i = 0; i < 7; i++) r.extra += '<ellipse cx="' + (32 + i * 3.4) + '" cy="' + (-150 + i * 14) + '" rx="9" ry="9.5" fill="' + c.hair + '" stroke="rgba(255,255,255,.07)" stroke-width="1.5"/>';
      r.extra += '<rect x="50" y="-56" width="10" height="6" rx="2" fill="' + c.accent + '"/>';
    }
    return r;
  }
  function neckwear(a, c) {
    if (a.neck === 'bowtie') return '<path d="M0 -124 L-17 -133 L-17 -114 Z M0 -124 L17 -133 L17 -114Z" fill="#D2333F"/><circle cx="0" cy="-124" r="3.6" fill="#A8222D"/>';
    if (a.neck === 'chain') return '<path d="M-26 -126 Q0 -94 26 -126" stroke="#E8B931" stroke-width="3.2" fill="none" stroke-dasharray="4 2.5"/><path d="M0 -104 L5 -98 L0 -92 L-5 -98Z" fill="#E8B931"/>';
    if (a.neck === 'headphones') return '<path d="M-40 -128 Q0 -102 40 -128" stroke="#3A3F4A" stroke-width="6" fill="none"/><ellipse cx="-42" cy="-128" rx="10" ry="13" fill="#262A33" stroke="' + c.accent + '" stroke-width="2"/><ellipse cx="42" cy="-128" rx="10" ry="13" fill="#262A33" stroke="' + c.accent + '" stroke-width="2"/>';
    return '';
  }

  const MOUTH = {
    neutral: 'M-10 -158 Q0 -156 10 -158', think: 'M-9 -158 Q0 -158 9 -160', smile: 'M-13 -161 Q0 -149 13 -161',
    grin: 'M-14 -162 Q0 -145 14 -162 Z', frown: 'M-11 -153 Q0 -161 11 -153', smirk: 'M-10 -157 Q3 -156 13 -162',
    shock: 'M-6 -157 a6 7 0 1 0 12 0 a6 7 0 1 0 -12 0'
  };
  K.MOUTH = MOUTH;

  function head(a, c, expr) {
    const f = FACE[a.face] || FACE.oval, rx = f[0], ry = f[1], sx = (rx / 40).toFixed(3);
    const hr = hair(a, c);
    const eye = function (x) {
      return '<g transform="translate(' + x + ' -190)"><g class="eye"><ellipse rx="8" ry="6.2" fill="#F4EFEA"/>' +
        '<g class="pupil"><circle r="4.4" fill="' + c.iris + '"/><circle r="2.1" fill="#0B0B0B"/><circle cx="1.4" cy="-1.5" r="1.1" fill="#fff"/></g>' +
        '<path d="M-9 -5.2 Q0 -9.7 9 -5.2" stroke="#1B0F0A" stroke-width="2.2" fill="none" stroke-linecap="round"/></g></g>';
    };
    const m = MOUTH[expr] || MOUTH.neutral, filled = expr === 'grin' || expr === 'shock';
    return '<g class="head">' +
      '<g transform="scale(' + sx + ' 1)">' + hr.back + '</g>' +
      '<ellipse cx="' + (-rx) + '" cy="-186" rx="7" ry="11" fill="' + c.shade + '"/><ellipse cx="' + rx + '" cy="-186" rx="7" ry="11" fill="' + c.shade + '"/>' +
      '<ellipse cx="0" cy="-188" rx="' + rx + '" ry="' + ry + '" fill="' + c.skin + '"/>' +
      '<ellipse cx="' + (-rx * 0.55).toFixed(1) + '" cy="-170" rx="8" ry="5" fill="#E2735C" opacity=".15"/><ellipse cx="' + (rx * 0.55).toFixed(1) + '" cy="-170" rx="8" ry="5" fill="#E2735C" opacity=".15"/>' +
      '<g transform="scale(' + sx + ' 1)">' + facialUnder(a, c) + '</g>' +
      eye(-15) + eye(15) +
      '<g class="xeyes" display="none"><path d="M-22 -197 L-8 -183 M-8 -197 L-22 -183 M8 -197 L22 -183 M22 -197 L8 -183" stroke="#1B0F0A" stroke-width="3.4" stroke-linecap="round"/></g>' +
      '<path class="brow-l" d="M-25 -204 Q-15 -209 -6 -205" stroke="' + c.hair + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path class="brow-r" d="M6 -205 Q15 -209 25 -204" stroke="' + c.hair + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M-1 -186 Q-5 -172 0 -170 Q4 -170 5 -173" stroke="' + c.shade + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<path class="mouth" d="' + m + '" stroke="#5A2A22" stroke-width="3" fill="' + (filled ? '#3A1414' : 'none') + '" stroke-linecap="round" stroke-linejoin="round"/>' +
      facialOver(a, c) +
      '<g transform="scale(' + sx + ' 1)">' + hr.front + headwear(a, c) + '</g>' + eyewear(a) +
      '<ellipse class="flush" cx="0" cy="-188" rx="' + rx + '" ry="' + ry + '" fill="#FF2A2A"/>' +
    '</g>';
  }
  function upper(a, c, expr) {
    const o = outfit(a, c);
    return o.back +
      '<path d="M-86 44 L-84 -88 Q-82 -116 -46 -124 L-16 -128 L16 -128 L46 -124 Q82 -116 84 -88 L86 44 Z" fill="' + o.torso + '"/>' + o.extra +
      '<path d="M-86 44 L-84 -88 Q-82 -116 -46 -124 L-34 -126 Q-62 -100 -64 44 Z" fill="#000" opacity=".2"/>' +
      '<path d="M-15 -152 L-15 -124 Q0 -112 15 -124 L15 -152 Z" fill="' + c.shade + '"/>' + neckwear(a, c) +
      '<path d="M-74 -104 C-98 -70 -96 -30 -72 -16" stroke="' + o.sleeve + '" stroke-width="28" fill="none" stroke-linecap="round"/>' +
      '<path d="M74 -104 C98 -70 96 -30 72 -16" stroke="' + o.sleeve + '" stroke-width="28" fill="none" stroke-linecap="round"/>' +
      head(a, c, expr);
  }

  /* seated player for the table scene */
  K.avatarSeat = function (a) {
    const c = colors(a), o = outfit(a, c);
    const chair = '<path d="M-94 30 L-94 -192 Q-94 -226 -60 -230 L60 -230 Q94 -226 94 -192 L94 30 Z" fill="#141A22" stroke="#2A2F3E" stroke-width="3"/>' +
      '<path d="M-70 -200 L70 -200 M-70 -160 L70 -160 M-70 -120 L70 -120" stroke="#1C2230" stroke-width="2"/>' +
      '<path d="M0 -226 L8 -214 L0 -202 L-8 -214Z" fill="#C8243A" opacity=".55"/>';
    const body = '<g class="breath">' + upper(a, c, 'neutral') + '</g>';
    const hand = function (sx) {
      let s = '<ellipse cx="' + (46 * sx) + '" cy="-44" rx="12" ry="16" fill="' + c.skin + '"/>';
      [-66, -56, -46].forEach(function (y) { s += '<rect x="' + (sx < 0 ? -42 : 28) + '" y="' + y + '" width="14" height="8" rx="4" fill="' + c.skin + '" stroke="' + c.shade + '" stroke-width="1"/>'; });
      return s;
    };
    const front =
      '<path d="M-76 -14 Q-64 -20 -50 -38" stroke="' + o.sleeve + '" stroke-width="24" fill="none" stroke-linecap="round"/>' +
      '<path d="M76 -14 Q64 -20 50 -38" stroke="' + o.sleeve + '" stroke-width="24" fill="none" stroke-linecap="round"/>' +
      '<g class="tablet">' +
        '<g class="tb-back"><rect x="-42" y="-86" width="84" height="84" rx="9" fill="#10141B" stroke="#2B3346" stroke-width="2"/><path d="M0 -58 L12 -44 L0 -30 L-12 -44Z" fill="none" stroke="#3A2230" stroke-width="2.5"/><circle class="led" cx="30" cy="-76" r="3.4"/></g>' +
        '<g class="tb-front" opacity="0"><rect x="-42" y="-86" width="84" height="84" rx="9" fill="#0B0F18" stroke="' + c.accent + '" stroke-width="3"/><text class="tb-num" x="0" y="-32" text-anchor="middle" font-size="36" font-weight="700" font-family="Martian Mono,monospace" fill="#fff">0</text></g>' +
      '</g>' + hand(-1) + hand(1);
    return { chair: chair, body: body, front: front };
  };
  /* head and shoulders portrait */
  K.avatarBust = function (a, expr) {
    const c = colors(a);
    return '<svg class="av-svg" viewBox="-108 -284 216 216" aria-hidden="true">' + upper(a, c, expr || 'smile') + '</svg>';
  };
  /* face features only, transparent background, for texturing a 3D head */
  K.EXPR = {
    neutral: { m: 'neutral', b: [0, 0, 0, 0] }, think: { m: 'think', b: [-3, -6, 1, 6] }, smirk: { m: 'smirk', b: [0, 4, -3, -6] },
    smile: { m: 'smile', b: [-2, -3, -2, 3] }, grin: { m: 'grin', b: [-3, -4, -3, 4] }, frown: { m: 'frown', b: [1, -10, 1, 10] },
    angry: { m: 'frown', b: [2, 12, 2, -12] }, shock: { m: 'shock', b: [-6, -4, -6, 4] }
  };
  K.avatarFaceSVG = function (a, st) {
    st = st || {};
    const c = colors(a), f = FACE[a.face] || FACE.oval, sx = (f[0] / 40).toFixed(3);
    const E = K.EXPR[st.expr] || K.EXPR.neutral, g = st.gaze || [0, 0];
    const eye = function (x) {
      return '<g transform="translate(' + x + ' -190)' + (st.blink ? ' scale(1 0.1)' : '') + '"><ellipse rx="8.5" ry="6.6" fill="#F4EFEA"/>' +
        '<g transform="translate(' + g[0] + ' ' + g[1] + ')"><circle r="4.6" fill="' + c.iris + '"/><circle r="2.2" fill="#0B0B0B"/><circle cx="1.5" cy="-1.6" r="1.2" fill="#fff"/></g>' +
        '<path d="M-9.5 -5.4 Q0 -10.2 9.5 -5.4" stroke="#1B0F0A" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>';
    };
    const filled = E.m === 'grin' || E.m === 'shock';
    const eyes = st.dead
      ? '<path d="M-22 -197 L-8 -183 M-8 -197 L-22 -183 M8 -197 L22 -183 M22 -197 L8 -183" stroke="#1B0F0A" stroke-width="3.6" stroke-linecap="round"/>'
      : eye(-15) + eye(15);
    const body = '<ellipse cx="-22" cy="-170" rx="9" ry="5.5" fill="#E2735C" opacity=".22"/><ellipse cx="22" cy="-170" rx="9" ry="5.5" fill="#E2735C" opacity=".22"/>' +
      '<g transform="scale(' + sx + ' 1)">' + facialUnder(a, c) + '</g>' + eyes +
      '<path d="M-25 -204 Q-15 -209 -6 -205" transform="translate(0 ' + E.b[0] + ') rotate(' + E.b[1] + ' -15 -206)" stroke="' + c.hair + '" stroke-width="4.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M6 -205 Q15 -209 25 -204" transform="translate(0 ' + E.b[2] + ') rotate(' + E.b[3] + ' 15 -206)" stroke="' + c.hair + '" stroke-width="4.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M-1 -186 Q-5 -172 0 -170 Q4 -170 5 -173" stroke="' + c.shade + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<path d="' + (MOUTH[st.dead ? 'shock' : E.m] || MOUTH.neutral) + '" stroke="#5A2A22" stroke-width="3.2" fill="' + (filled || st.dead ? '#3A1414' : 'none') + '" stroke-linecap="round" stroke-linejoin="round"/>' +
      facialOver(a, c) + eyewear(a) +
      (st.blood ? '<path d="M-6 -224 q4 -6 8 0 q2 6 -4 8 q-6 -2 -4 -8z" fill="#8E0E1A"/><path d="M-2 -216 L-3 -196" stroke="#8E0E1A" stroke-width="2.4" stroke-linecap="round"/>' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-50 -238 100 98" preserveAspectRatio="none">' + body + '</svg>';
  };

  /* small head, for chips and lists */
  K.avatarHead = function (a, expr) {
    const c = colors(a);
    return '<svg class="av-svg" viewBox="-62 -262 124 124" aria-hidden="true"><g transform="translate(0 0)">' + head(a, c, expr || 'smile') + '</g></svg>';
  };
})();
