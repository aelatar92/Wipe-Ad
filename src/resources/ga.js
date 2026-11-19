// Wipe Ad surrogate for Google Analytics (analytics.js): keeps pages working, sends nothing.
(function () {
  'use strict';
  const noop = function () {};
  const tracker = { get: noop, set: noop, send: noop };
  const ga = function () {
    const args = arguments, last = args[args.length - 1];
    if (last && typeof last === 'object' && typeof last.hitCallback === 'function') { try { last.hitCallback(); } catch (e) {} }
    if (typeof args[0] === 'function') { try { args[0](tracker); } catch (e) {} }
  };
  ga.create = () => tracker; ga.getByName = () => tracker; ga.getAll = () => [tracker]; ga.remove = noop; ga.loaded = true;
  const name = window.GoogleAnalyticsObject || 'ga';
  const queue = window[name] && window[name].q;
  window[name] = ga;
  if (Array.isArray(queue)) queue.forEach(a => ga.apply(null, a));
  window.gaplugins = window.gaplugins || {};
  window.gaplugins.Linker = function () {}; window.gaplugins.Linker.prototype.autoLink = noop;
})();
