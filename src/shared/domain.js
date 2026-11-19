// Wipe Ad — hostname helpers backed by a compact Public Suffix List.

let PSL = null; // { r: [...rules], w: [...wildcards], e: [...exceptions] } -> Sets

export function setPublicSuffixList(data) {
  PSL = { rules: new Set(data.r || []), wild: new Set(data.w || []), exc: new Set(data.e || []) };
}

function isIP(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

export function getPublicSuffix(host) {
  const labels = host.split('.');
  if (!PSL) return labels.slice(-1).join('.');
  for (let i = 0; i < labels.length; i++) {
    const cand = labels.slice(i).join('.');
    if (PSL.exc.has(cand)) return labels.slice(i + 1).join('.');
    if (PSL.rules.has(cand)) return cand;
    const parent = labels.slice(i + 1).join('.');
    if (parent && PSL.wild.has(parent)) return cand;
  }
  return labels.slice(-1).join('.');
}

/** Registrable domain (eTLD+1): "a.b.example.co.uk" -> "example.co.uk" */
export function getBaseDomain(host) {
  if (!host) return '';
  host = host.toLowerCase().replace(/\.$/, '');
  if (isIP(host)) return host;
  const suffix = getPublicSuffix(host);
  if (suffix === host) return host;
  const rest = host.slice(0, host.length - suffix.length - 1);
  const label = rest.split('.').pop();
  return `${label}.${suffix}`;
}

/** Entity form used by filter lists: "www.google.co.uk" -> "google.*" */
export function getEntity(host) {
  const base = getBaseDomain(host);
  const suffix = getPublicSuffix(base);
  if (suffix === base) return null;
  return base.slice(0, base.length - suffix.length) + '*';
}

/** All lookup keys for a host: itself, its parents down to the base domain, and the entity forms. */
export function hostKeys(host) {
  host = (host || '').toLowerCase();
  const keys = [];
  const base = getBaseDomain(host);
  let h = host;
  while (h) {
    keys.push(h);
    if (h === base) break;
    const i = h.indexOf('.');
    if (i === -1) break;
    h = h.slice(i + 1);
  }
  // entity variants: sub.google.* and google.*
  const suffix = getPublicSuffix(host);
  if (suffix && suffix !== host) {
    const stem = host.slice(0, host.length - suffix.length);
    let s = stem;
    while (s && s.includes('.')) {
      keys.push(s + '*');
      const i = s.indexOf('.');
      if (i === s.length - 1) break;
      s = s.slice(i + 1);
    }
  }
  return keys;
}

export function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

// Organisations that own several registrable domains (treated as first party to each other)
const ENTITY_GROUPS = [
  ['google.com', 'youtube.com', 'gstatic.com', 'googleapis.com', 'googleusercontent.com', 'ytimg.com', 'ggpht.com', 'googlevideo.com', 'gmail.com', 'blogger.com', 'google.com.eg', 'google.com.sa', 'google.ae'],
  ['facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com', 'messenger.com', 'whatsapp.com', 'whatsapp.net', 'facebook.net', 'threads.net'],
  ['microsoft.com', 'live.com', 'bing.com', 'msn.com', 'office.com', 'microsoftonline.com', 'outlook.com', 'xbox.com', 'skype.com', 'azureedge.net', 'sharepoint.com', 'windows.net'],
  ['amazon.com', 'amazonaws.com', 'media-amazon.com', 'ssl-images-amazon.com', 'amazon.eg', 'amazon.sa', 'amazon.ae', 'primevideo.com', 'twitch.tv', 'jtvnw.net'],
  ['twitter.com', 'x.com', 'twimg.com', 't.co'],
  ['apple.com', 'icloud.com', 'mzstatic.com', 'apple-cloudkit.com'],
  ['yahoo.com', 'yimg.com', 'aol.com'],
  ['netflix.com', 'nflxext.com', 'nflximg.net', 'nflxvideo.net', 'nflxso.net'],
  ['github.com', 'githubusercontent.com', 'githubassets.com', 'github.io'],
  ['reddit.com', 'redd.it', 'redditstatic.com', 'redditmedia.com'],
  ['linkedin.com', 'licdn.com'],
  ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'ttwstatic.com'],
  ['wikipedia.org', 'wikimedia.org', 'wikidata.org'],
];
const ENTITY_MAP = new Map();
ENTITY_GROUPS.forEach((g, i) => g.forEach(d => ENTITY_MAP.set(d, i)));

export function sameEntity(baseA, baseB) {
  if (baseA === baseB) return true;
  const a = ENTITY_MAP.get(baseA), b = ENTITY_MAP.get(baseB);
  return a !== undefined && a === b;
}
