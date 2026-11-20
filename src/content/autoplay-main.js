// Wipe Ad — stop videos/audio from auto-playing before you interact with the page (page MAIN world).
(() => {
  'use strict';
  const interacted = () => navigator.userActivation ? navigator.userActivation.hasBeenActive : window.__wipeAdInteracted === true;
  if (!navigator.userActivation) {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => { window.__wipeAdInteracted = true; }, { capture: true, once: true });
  }
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    if (!interacted() && !this.__wipeAdAllowed) {
      this.removeAttribute('autoplay');
      return Promise.reject(new DOMException('Autoplay blocked by Wipe Ad', 'NotAllowedError'));
    }
    return origPlay.apply(this, a);
  };
  // once the user clicks a specific player, allow it
  document.addEventListener('click', e => { const m = e.target?.closest?.('video,audio') || e.target?.closest?.('*')?.querySelector?.('video,audio'); if (m) m.__wipeAdAllowed = true; }, true);
  const strip = root => root.querySelectorAll?.('video[autoplay],audio[autoplay]').forEach(m => { m.removeAttribute('autoplay'); m.autoplay = false; if (!interacted()) m.pause?.(); });
  new MutationObserver(ms => { if (!interacted()) for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (/^(VIDEO|AUDIO)$/.test(n.nodeName)) strip(n.parentNode || document); else strip(n); } })
    .observe(document, { childList: true, subtree: true });
})();
