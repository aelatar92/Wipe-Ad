// Wipe Ad surrogate for Google Tag Manager / gtag.js
(function () {
  'use strict';
  const dl = window.dataLayer = window.dataLayer || [];
  const fire = o => { if (o && typeof o.eventCallback === 'function') { try { setTimeout(o.eventCallback, 1); } catch (e) {} } };
  dl.forEach(fire);
  const push = dl.push.bind(dl);
  dl.push = function () { for (const o of arguments) fire(o); return push.apply(null, arguments); };
  window.google_tag_manager = window.google_tag_manager || {};
  window.gtag = window.gtag || function () {
    const a = arguments; const cfg = a[2];
    if (cfg && typeof cfg.event_callback === 'function') setTimeout(cfg.event_callback, 1);
  };
})();
