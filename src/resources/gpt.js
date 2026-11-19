// Wipe Ad surrogate for Google Publisher Tag (googletag)
(function () {
  'use strict';
  const noop = function () {}, self = function () { return this; };
  const slot = { addService: self, defineSizeMapping: self, setTargeting: self, setCollapseEmptyDiv: self, clearTargeting: self,
    getSlotElementId: () => '', getAdUnitPath: () => '', getTargeting: () => [], getTargetingKeys: () => [], setClickUrl: self,
    setForceSafeFrame: self, setSafeFrameConfig: self, getResponseInformation: () => null, getSizes: () => [], setConfig: self };
  const pubads = { addEventListener: self, removeEventListener: self, enableSingleRequest: self, enableAsyncRendering: self,
    collapseEmptyDivs: self, disableInitialLoad: self, setTargeting: self, clearTargeting: self, refresh: noop, display: noop,
    setPrivacySettings: self, setRequestNonPersonalizedAds: self, getSlots: () => [], enableLazyLoad: self, setCentering: self,
    updateCorrelator: self, isInitialLoadDisabled: () => true, getTargeting: () => [], getTargetingKeys: () => [], clear: () => true, set: self, get: () => null };
  const gt = window.googletag = window.googletag || {};
  const queued = Array.isArray(gt.cmd) ? gt.cmd : [];
  Object.assign(gt, {
    apiReady: true, pubadsReady: true, defineSlot: () => Object.create(slot), defineOutOfPageSlot: () => Object.create(slot),
    destroySlots: () => true, display: noop, enableServices: noop, pubads: () => pubads, sizeMapping: () => ({ addSize: self, build: () => [] }),
    companionAds: () => ({ setRefreshUnfilledSlots: self }), content: () => ({ setContent: noop }), setConfig: noop, getConfig: () => ({}),
    cmd: { push: fn => { try { fn(); } catch (e) {} return 1; } }, enums: { OutOfPageFormat: {}, TrafficSource: {} },
  });
  queued.forEach(fn => { try { fn(); } catch (e) {} });
})();
