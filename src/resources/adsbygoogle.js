// Wipe Ad surrogate for AdSense (adsbygoogle.js)
(function () {
  'use strict';
  const q = window.adsbygoogle;
  window.adsbygoogle = { loaded: true, push: function () {} };
  if (Array.isArray(q)) q.length = 0;
  document.querySelectorAll('ins.adsbygoogle').forEach(el => { el.setAttribute('data-adsbygoogle-status', 'done'); el.style.setProperty('display', 'none', 'important'); });
})();
