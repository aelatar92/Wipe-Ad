// Wipe Ad — silently refuse "Allow notifications?" prompts (page MAIN world).
(() => {
  'use strict';
  if (!window.Notification) return;
  try {
    Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true });
    Notification.requestPermission = function (cb) { if (typeof cb === 'function') setTimeout(() => cb('denied')); return Promise.resolve('denied'); };
    const q = navigator.permissions?.query?.bind(navigator.permissions);
    if (q) navigator.permissions.query = (desc) => (desc && (desc.name === 'notifications' || desc.name === 'push'))
      ? Promise.resolve(Object.assign(Object.create(PermissionStatus.prototype), { state: 'denied', name: desc.name, onchange: null }))
      : q(desc);
    if (window.PushManager) PushManager.prototype.subscribe = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  } catch { /* ignore */ }
})();
