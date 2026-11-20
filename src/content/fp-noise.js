// Wipe Ad — anti-fingerprinting (page MAIN world): adds tiny, per-page-load noise to
// canvas, WebGL and audio readouts so they can no longer identify the browser.
(() => {
  'use strict';
  if (window.__wipeAdFpNoise) return;
  try { Object.defineProperty(window, '__wipeAdFpNoise', { value: true }); } catch { return; }
  let seed = (Math.random() * 2 ** 31) | 0;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1000) / 1000; };

  const noisify = (data) => {
    // flip the lowest bit of ~1% of pixels' colour channels
    for (let i = 0; i < data.length; i += 4) {
      if (rnd() < 0.01) { data[i] ^= 1; data[i + 1] ^= (rnd() < 0.5 ? 1 : 0); data[i + 2] ^= 1; }
    }
  };
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...a) {
    const img = origGetImageData.apply(this, a);
    try { noisify(img.data); } catch { /* ignore */ }
    return img;
  };
  const noisyCopy = (canvas) => {
    if (!canvas.width || !canvas.height) return canvas;
    const copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const img = origGetImageData.call(ctx, 0, 0, copy.width, copy.height);
    noisify(img.data);
    ctx.putImageData(img, 0, 0);
    return copy;
  };
  for (const name of ['toDataURL', 'toBlob']) {
    const orig = HTMLCanvasElement.prototype[name];
    HTMLCanvasElement.prototype[name] = function (...a) {
      let target = this;
      try { if (this.width * this.height <= 4e6) target = noisyCopy(this); } catch { /* tainted or webgl canvas */ }
      return orig.apply(target, a);
    };
  }
  // WebGL: hide the real GPU
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    const orig = proto.getParameter;
    proto.getParameter = function (p) {
      if (p === 0x9245) return 'Google Inc.';
      if (p === 0x9246) return 'ANGLE (Generic GPU)';
      return orig.call(this, p);
    };
  }
  // Audio: tiny noise on rendered buffers
  const done = new WeakSet();
  const origChannel = AudioBuffer.prototype.getChannelData;
  AudioBuffer.prototype.getChannelData = function (...a) {
    const d = origChannel.apply(this, a);
    if (!done.has(d)) { done.add(d); for (let i = 0; i < d.length; i += 100) d[i] += (rnd() - 0.5) * 1e-7; }
    return d;
  };
  const origFreq = window.AnalyserNode?.prototype.getFloatFrequencyData;
  if (origFreq) window.AnalyserNode.prototype.getFloatFrequencyData = function (arr) {
    origFreq.call(this, arr);
    for (let i = 0; i < arr.length; i += 10) arr[i] += (rnd() - 0.5) * 0.1;
  };
})();
