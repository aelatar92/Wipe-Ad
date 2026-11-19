// Wipe Ad — Global Privacy Control signal in the page (MAIN world)
(() => {
  try {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true, enumerable: true });
    Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1', configurable: true, enumerable: true });
  } catch { /* ignore */ }
})();
