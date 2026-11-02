/* King of Diamonds: boot. */
(function () {
  'use strict';
  const K = window.KOD;
  K.FAST = !!window.__KOD_FAST;
  K.RULES_FOR = window.KODRules.rulesFor;
  K.Voice.init();
  K.FX.init();
  K.BG.init();
  K.UI.init();
  K.VC.init();
  K.UI.go('menu', { instant: true, noFocus: true });

  // invite links: ?room=ABCDE opens the join screen and joins
  const m = /[?&]room=([A-Za-z0-9]{5})/.exec(location.search);
  if (m) {
    K.UI.go('join', { instant: true });
    document.getElementById('joinCode').value = m[1].toUpperCase();
    if (K.Net.available()) K.UI.joinRoom(m[1]);
  }
  const f = /[?&]friend=([A-Za-z0-9]{7})/.exec(location.search);
  if (f && K.Net.available()) K.Social.fromLink(f[1]);
  else if (!m) K.UI.restore();
  if (K.FAST) window.__KOD = K;
})();
