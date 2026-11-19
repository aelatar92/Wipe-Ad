// Wipe Ad surrogate for Amazon Publisher Services (apstag)
(function () {
  'use strict';
  const noop = function () {};
  const q = window.apstag && window.apstag._Q;
  window.apstag = { _Q: [], init: noop, setDisplayBids: noop, targetingKeys: () => [], debug: noop,
    fetchBids: (cfg, cb) => { if (typeof cb === 'function') setTimeout(() => cb([]), 1); } };
  if (Array.isArray(q)) q.forEach(([m, a]) => { if (m === 'f' && a && typeof a[1] === 'function') a[1]([]); });
})();
