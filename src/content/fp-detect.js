// Wipe Ad — fingerprinting detection (page MAIN world). Reports which APIs a page
// uses for fingerprinting and which script called them; content/main.js forwards it.
(() => {
  'use strict';
  if (window.__wipeAdFpDetect) return;
  try { Object.defineProperty(window, '__wipeAdFpDetect', { value: true }); } catch { return; }
  const seen = new Set();
  const caller = () => {
    const lines = (new Error().stack || '').split('\n');
    for (const l of lines) {
      const m = l.match(/(https?:\/\/[^\s)]+?):\d+:\d+/);
      if (m && !m[1].includes('fp-detect') && !m[1].includes('fp-noise')) return m[1];
    }
    return location.href;
  };
  const report = (api) => {
    const script = caller();
    const key = api + '|' + script;
    if (seen.has(key)) return;
    seen.add(key);
    document.dispatchEvent(new CustomEvent('wipead:fp', { detail: JSON.stringify({ api, script }) }));
  };
  const wrap = (proto, name, api, test) => {
    const orig = proto?.[name];
    if (typeof orig !== 'function') return;
    proto[name] = new Proxy(orig, { apply(t, th, a) { try { if (!test || test(th, a)) report(api); } catch { /* ignore */ } return Reflect.apply(t, th, a); } });
  };
  // canvas: reading pixels back from a canvas that was drawn on
  const bigEnough = c => c && c.width >= 16 && c.height >= 16;
  wrap(HTMLCanvasElement.prototype, 'toDataURL', 'canvas', c => bigEnough(c));
  wrap(HTMLCanvasElement.prototype, 'toBlob', 'canvas', c => bigEnough(c));
  wrap(CanvasRenderingContext2D.prototype, 'getImageData', 'canvas', c => bigEnough(c.canvas));
  // WebGL: unmasked GPU vendor / renderer
  const glTest = (_, a) => a[0] === 0x9245 || a[0] === 0x9246;
  wrap(window.WebGLRenderingContext?.prototype, 'getParameter', 'webgl', glTest);
  wrap(window.WebGL2RenderingContext?.prototype, 'getParameter', 'webgl', glTest);
  // audio: offline rendering
  wrap(window.OfflineAudioContext?.prototype, 'startRendering', 'audio');
  // fonts: many measureText calls with different fonts in a short time
  let fonts = new Set(), since = Date.now();
  wrap(CanvasRenderingContext2D.prototype, 'measureText', 'fonts', c => {
    if (Date.now() - since > 2000) { fonts = new Set(); since = Date.now(); }
    fonts.add(c.font);
    return fonts.size > 30;
  });
})();
