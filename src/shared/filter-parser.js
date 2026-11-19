// Wipe Ad — filter list compiler.
// Understands the common subset of Adblock Plus / uBlock Origin / AdGuard syntax and
// turns it into: declarativeNetRequest rules + cosmetic data + scriptlet data.
// Used by the build tool (Node) and at runtime (user filters, remote delta lists).

import { PRIORITY } from './config.js';

const TYPE_MAP = {
  script: 'script', image: 'image', stylesheet: 'stylesheet', css: 'stylesheet',
  object: 'object', 'object-subrequest': 'object', xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest', subdocument: 'sub_frame', frame: 'sub_frame', ping: 'ping',
  beacon: 'ping', media: 'media', font: 'font', websocket: 'websocket', other: 'other',
  document: 'main_frame', doc: 'main_frame',
};
export const ALL_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'media', 'websocket', 'other',
];

// Bundled neutered resources for $redirect=
export const REDIRECTS = {
  'noopjs': 'noop.js', 'noop.js': 'noop.js', 'noopjs.js': 'noop.js',
  'noop.txt': 'noop.txt', 'nooptext': 'noop.txt', 'noopcss': 'noop.css', 'noop.css': 'noop.css',
  'noop.html': 'noop.html', 'noopframe': 'noop.html',
  '1x1.gif': '1x1.gif', '1x1-transparent.gif': '1x1.gif', '1x1-transparent-gif': '1x1.gif',
  '2x2.png': '2x2.png', '2x2-transparent.png': '2x2.png', '3x2.png': '2x2.png', '32x32.png': '2x2.png',
  '32x32-transparent.png': '2x2.png', 'noopjson': 'noop.json', 'noop.json': 'noop.json',
  'google-analytics_analytics.js': 'ga.js', 'google-analytics.com/analytics.js': 'ga.js',
  'googletagmanager_gtm.js': 'gtm.js', 'googletagmanager-gtm': 'gtm.js', 'google-analytics-ga': 'ga.js',
  'googletagservices_gpt.js': 'gpt.js', 'googletagservices-gpt': 'gpt.js',
  'googlesyndication_adsbygoogle.js': 'adsbygoogle.js', 'googlesyndication-adsbygoogle': 'adsbygoogle.js',
  'amazon_apstag.js': 'apstag.js', 'amazon-apstag': 'apstag.js',
};

// Scriptlets implemented in src/scriptlets/scriptlets.js (canonical names + aliases)
const SCRIPTLET_ALIASES = {
  'set-constant': 'set-constant', 'set': 'set-constant',
  'abort-on-property-read': 'abort-on-property-read', 'aopr': 'abort-on-property-read',
  'abort-on-property-write': 'abort-on-property-write', 'aopw': 'abort-on-property-write',
  'abort-current-script': 'abort-current-script', 'acs': 'abort-current-script',
  'abort-current-inline-script': 'abort-current-script', 'acis': 'abort-current-script',
  'json-prune': 'json-prune',
  'no-settimeout-if': 'no-setTimeout-if', 'nostif': 'no-setTimeout-if', 'prevent-settimeout': 'no-setTimeout-if',
  'setTimeout-defuser': 'no-setTimeout-if', 'settimeout-defuser': 'no-setTimeout-if',
  'no-setinterval-if': 'no-setInterval-if', 'nosiif': 'no-setInterval-if', 'prevent-setinterval': 'no-setInterval-if',
  'setinterval-defuser': 'no-setInterval-if',
  'addeventlistener-defuser': 'prevent-addEventListener', 'aeld': 'prevent-addEventListener',
  'prevent-addeventlistener': 'prevent-addEventListener',
  'no-fetch-if': 'no-fetch-if', 'prevent-fetch': 'no-fetch-if',
  'no-xhr-if': 'no-xhr-if', 'prevent-xhr': 'no-xhr-if',
  'remove-attr': 'remove-attr', 'ra': 'remove-attr',
  'remove-class': 'remove-class', 'rc': 'remove-class',
  'window.open-defuser': 'no-window-open-if', 'nowoif': 'no-window-open-if',
  'no-window-open-if': 'no-window-open-if', 'prevent-window-open': 'no-window-open-if',
  'nano-settimeout-booster': 'adjust-setTimeout', 'nano-stb': 'adjust-setTimeout', 'adjust-settimeout': 'adjust-setTimeout',
  'nano-setinterval-booster': 'adjust-setInterval', 'nano-sib': 'adjust-setInterval', 'adjust-setinterval': 'adjust-setInterval',
  'set-cookie': 'set-cookie', 'set-local-storage-item': 'set-local-storage-item',
  'set-session-storage-item': 'set-session-storage-item',
  'remove-node-text': 'remove-node-text', 'rmnt': 'remove-node-text',
  'noeval': 'noeval', 'prevent-eval-if': 'noeval-if', 'noeval-if': 'noeval-if',
  'disable-newtab-links': 'disable-newtab-links',
  'prevent-refresh': 'prevent-refresh', 'refresh-defuser': 'prevent-refresh',
  'href-sanitizer': 'href-sanitizer', 'trusted-click-element': 'click-element', 'click-element': 'click-element',
};
export const SCRIPTLET_NAMES = new Set(Object.values(SCRIPTLET_ALIASES));

export function normalizeScriptletName(raw) {
  let n = String(raw || '').trim().replace(/^ubo-/, '').replace(/\.js$/, '');
  return SCRIPTLET_ALIASES[n] || SCRIPTLET_ALIASES[n.toLowerCase()] || null;
}

const PROCEDURAL_RE = /:(-abp-contains|has-text|contains|upward|remove|style|-abp-has|matches-css|xpath|min-text-length|watch-attr|matches-path|matches-attr|others|remove-attr|remove-class|nth-ancestor|matches-media)\(/;

// ---------------------------------------------------------------------------
// Preprocessor (!#if / !#else / !#endif) used by uBlock lists
// ---------------------------------------------------------------------------
const ENV = {
  env_chromium: true, env_mv3: true, ext_ublock: true, ext_ubol: true,
  adguard: false, adguard_ext_chromium: true, env_firefox: false, env_edge: false,
  env_safari: false, env_mobile: false, cap_html_filtering: false, cap_user_stylesheet: true,
  false: false, true: true,
};
function evalCond(expr, env) {
  // supports !, &&, ||, parentheses
  const tokens = expr.match(/!|&&|\|\||\(|\)|[\w.$-]+/g) || [];
  let i = 0;
  const parseOr = () => { let v = parseAnd(); while (tokens[i] === '||') { i++; v = parseAnd() || v; } return v; };
  const parseAnd = () => { let v = parseNot(); while (tokens[i] === '&&') { i++; v = parseNot() && v; } return v; };
  const parseNot = () => {
    if (tokens[i] === '!') { i++; return !parseNot(); }
    if (tokens[i] === '(') { i++; const v = parseOr(); i++; return v; }
    const t = tokens[i++]; return Boolean(env[t]);
  };
  try { return parseOr(); } catch { return false; }
}

export function preprocess(text, env = ENV) {
  const out = [];
  const stack = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('!#if ')) { stack.push(evalCond(line.slice(5), env)); continue; }
    if (line === '!#else') { if (stack.length) stack[stack.length - 1] = !stack[stack.length - 1]; continue; }
    if (line === '!#endif') { stack.pop(); continue; }
    if (stack.length && stack.includes(false)) continue;
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Single-line parsing
// ---------------------------------------------------------------------------
function splitDomains(str, sep) {
  const include = [], exclude = [];
  for (let d of str.split(sep)) {
    d = d.trim().toLowerCase();
    if (!d) continue;
    if (d.startsWith('~')) exclude.push(d.slice(1)); else include.push(d);
  }
  return { include, exclude };
}

function isAscii(s) { return /^[\x20-\x7e]*$/.test(s); }

function findCosmeticSep(line) {
  // order matters: longest separators first
  const seps = ['#@?#', '#@$?#', '#@$#', '#@%#', '#$?#', '#@#', '#?#', '#$#', '#%#', '##'];
  let best = null;
  for (const s of seps) {
    const i = line.indexOf(s);
    if (i !== -1 && (best === null || i < best.i || (i === best.i && s.length > best.s.length))) best = { i, s };
  }
  if (!best) return null;
  // Network rules may contain '#' (e.g. in URLs) — a cosmetic domain part cannot contain '/' or '$' or '|'
  const pre = line.slice(0, best.i);
  if (/[/|$^=\s]|\*(?!,|$)/.test(pre)) return null;
  return best;
}

export function parseArgs(str) {
  // comma separated, honoring quotes and backslash-escaped commas
  const args = [];
  let cur = '', quote = null, esc = false;
  for (const ch of str) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
    if ((ch === '"' || ch === "'") && cur.trim() === '') { quote = ch; cur = ''; continue; }
    if (ch === ',') { args.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '' || args.length) args.push(cur.trim());
  return args;
}

function parseCosmetic(line, sep) {
  const domainPart = line.slice(0, sep.i);
  let body = line.slice(sep.i + sep.s.length).trim();
  const exception = sep.s.includes('@');
  const domains = splitDomains(domainPart, ',');
  if (!body) return null;

  // uBO scriptlet: ##+js(name, args)
  if (body.startsWith('+js(') && body.endsWith(')')) {
    const inner = body.slice(4, -1);
    if (inner.trim() === '') return { kind: 'scriptlet', exception, domains, name: '*', args: [] };
    const args = parseArgs(inner);
    const name = normalizeScriptletName(args.shift());
    if (!name) return { kind: 'unsupported' };
    return { kind: 'scriptlet', exception, domains, name, args };
  }
  // AdGuard scriptlet: #%#//scriptlet('name', 'arg')
  if (sep.s === '#%#' || sep.s === '#@%#') {
    const m = body.match(/^\/\/scriptlet\((.*)\)$/);
    if (!m) return { kind: 'unsupported' };
    const args = parseArgs(m[1]);
    const name = normalizeScriptletName(args.shift());
    if (!name) return { kind: 'unsupported' };
    return { kind: 'scriptlet', exception, domains, name, args };
  }
  // AdGuard CSS injection: #$#selector { declarations }
  if (sep.s === '#$#' || sep.s === '#@$#') {
    const m = body.match(/^(.+?)\s*\{(.+)\}\s*$/);
    if (!m || /url\(|expression|@import/i.test(m[2])) return { kind: 'unsupported' };
    return { kind: 'style', exception, domains, selector: m[1].trim(), style: m[2].trim() };
  }
  if (sep.s === '#$?#' || sep.s === '#@$?#') return { kind: 'unsupported' };
  // HTML filtering / response filtering are not possible in MV3
  if (body.startsWith('^') || body.startsWith('+js') || body.startsWith('%')) return { kind: 'unsupported' };
  // uBO :style()
  const styleM = body.match(/^(.+?):style\((.+)\)$/);
  if (styleM && !PROCEDURAL_RE.test(styleM[1])) {
    if (/url\(|expression|@import/i.test(styleM[2])) return { kind: 'unsupported' };
    return { kind: 'style', exception, domains, selector: styleM[1], style: styleM[2] };
  }
  const procedural = sep.s.includes('?') || PROCEDURAL_RE.test(body);
  return { kind: 'cosmetic', exception, domains, selector: body, procedural };
}

function parseNetwork(line) {
  let allow = false;
  if (line.startsWith('@@')) { allow = true; line = line.slice(2); }
  let pattern = line, optStr = '';
  // options start at the last '$' not inside a regex
  const isRegex = /^\/.*\/(\$|$)/.test(line) && line.length > 2;
  let dollar = -1;
  if (isRegex) {
    const end = line.lastIndexOf('/');
    dollar = line.indexOf('$', end);
  } else {
    dollar = line.lastIndexOf('$');
    // '$' inside the pattern followed by something that does not look like options
    if (dollar !== -1 && !/^[~\w-]+(=|,|$)/.test(line.slice(dollar + 1))) dollar = -1;
  }
  if (dollar !== -1) { pattern = line.slice(0, dollar); optStr = line.slice(dollar + 1); }

  const f = {
    kind: 'network', allow, pattern, regex: null, types: [], notTypes: [],
    domainType: null, initiator: null, to: null, important: false, matchCase: false,
    redirect: null, redirectRule: false, removeparam: null, csp: null, methods: null,
    badfilter: false, cosmeticHide: null, document: false, all: false,
  };
  if (isRegex) {
    const end = pattern.lastIndexOf('/');
    f.regex = pattern.slice(1, end);
    f.pattern = '';
  }
  if (optStr) {
    // options are comma separated, but values like domain=a|b contain no commas; regex values may
    for (const rawOpt of optStr.split(/,(?=~?[\w-]+(?:=|,|$))/)) {
      const opt = rawOpt.trim();
      if (!opt) continue;
      let [name, ...rest] = opt.split('=');
      const value = rest.join('=');
      let neg = false;
      if (name.startsWith('~')) { neg = true; name = name.slice(1); }
      name = name.toLowerCase();
      if (TYPE_MAP[name] && !value) {
        if (name === 'document' || name === 'doc') {
          if (allow && !neg) { f.document = true; continue; }
          if (neg) { f.notTypes.push('main_frame'); continue; }
          f.types.push('main_frame'); f.document = true; continue;
        }
        (neg ? f.notTypes : f.types).push(TYPE_MAP[name]);
        continue;
      }
      switch (name) {
        case 'third-party': case '3p': case 'strict3p': case 'strict-third-party':
          f.domainType = neg ? 'firstParty' : 'thirdParty'; break;
        case 'first-party': case '1p': case 'strict1p': case 'strict-first-party':
          f.domainType = neg ? 'thirdParty' : 'firstParty'; break;
        case 'domain': case 'from': f.initiator = splitDomains(value, '|'); break;
        case 'to': f.to = splitDomains(value, '|'); break;
        case 'denyallow': f.to = { include: f.to?.include || [], exclude: splitDomains(value, '|').include }; break;
        case 'important': f.important = true; break;
        case 'match-case': f.matchCase = true; break;
        case 'redirect': f.redirect = value; break;
        case 'redirect-rule': f.redirect = value; f.redirectRule = true; break;
        case 'removeparam': case 'queryprune': f.removeparam = value || '*'; break;
        case 'csp': f.csp = value; break;
        case 'method': f.methods = value.toLowerCase().split('|').filter(Boolean); break;
        case 'badfilter': f.badfilter = true; break;
        case 'all': f.all = true; break;
        case 'elemhide': case 'ehide': f.cosmeticHide = 'all'; break;
        case 'generichide': case 'ghide': f.cosmeticHide = 'generic'; break;
        case 'specifichide': case 'shide': f.cosmeticHide = 'specific'; break;
        case 'popup': case 'popunder': return { kind: 'unsupported' };
        case 'genericblock': case 'content': case 'jsinject': case 'urlblock': case 'extension':
          if (allow) { f.unsupported = true; } break;
        case 'stealth': case 'cookie': case 'header': case 'permissions': case 'replace':
        case 'hls': case 'jsonprune': case 'xmlprune': case 'urltransform': case 'uritransform':
        case 'ipaddress': case 'app': case 'network': case 'webrtc': case 'empty': case 'mp4':
        case 'inline-script': case 'inline-font': case 'webtransport': case 'webbundle':
        case 'responseheader': case 'reason': case 'urlskip':
          return { kind: 'unsupported' };
        default:
          return { kind: 'unsupported' };
      }
    }
  }
  if (f.unsupported) return { kind: 'unsupported' };
  // bare hostname patterns (e.g. "tracker.example.com$image") behave like ||hostname^
  if (f.regex === null && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(f.pattern)) f.pattern = '||' + f.pattern.toLowerCase() + '^';
  return f;
}

export function parseLine(rawLine) {
  const line = rawLine.trim();
  if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('# ') || line === '#') return null;
  // hosts file format
  const hosts = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1?)\s+([a-z0-9.-]+\.[a-z0-9-]+)\s*(?:#.*)?$/i);
  if (hosts) {
    if (/^(localhost|local|broadcasthost|0\.0\.0\.0)$/.test(hosts[1])) return null;
    return parseNetwork(`||${hosts[1].toLowerCase()}^`);
  }
  const sep = findCosmeticSep(line);
  if (sep) return parseCosmetic(line, sep);
  if (line.startsWith('#')) return null;
  return parseNetwork(line);
}

// ---------------------------------------------------------------------------
// Network filter → DNR rule
// ---------------------------------------------------------------------------
const PURE_DOMAIN_RE = /^\|\|([a-z0-9][a-z0-9.-]*\.[a-z0-9-]+)\^?\|?$/;
const UNSAFE_REGEX_RE = /\(\?[=!<]|\\[1-9]|\(\?<|\\[bB](?=.*\\[bB])/;

function toDnrCondition(f, opts) {
  const cond = {};
  if (f.regex !== null) {
    if (UNSAFE_REGEX_RE.test(f.regex) || f.regex.length > 300 || !isAscii(f.regex)) return null;
    cond.regexFilter = f.regex;
  } else {
    let p = f.pattern;
    if (p.startsWith('||*')) p = p.slice(3) ? '*' + p.slice(3) : '';
    if (p === '*' || p === '') p = '';
    if (p && !isAscii(p)) return null;
    if (p) cond.urlFilter = p;
  }
  if (f.matchCase) cond.isUrlFilterCaseSensitive = true;

  let types = f.all ? [...ALL_TYPES] : [...new Set(f.types)];
  if (opts.forceAllTypes && !types.length && !f.notTypes.length) types = [...ALL_TYPES];
  if (types.length) cond.resourceTypes = types.filter(t => !f.notTypes.includes(t));
  else if (f.notTypes.length) cond.excludedResourceTypes = [...new Set([...f.notTypes, 'main_frame'])];
  if (cond.resourceTypes && !cond.resourceTypes.length) return null;

  if (f.domainType) cond.domainType = f.domainType;
  if (f.initiator) {
    const inc = f.initiator.include.filter(d => !d.endsWith('.*') && isAscii(d));
    const exc = f.initiator.exclude.filter(d => !d.endsWith('.*') && isAscii(d));
    if (f.initiator.include.length && !inc.length) return null;
    if (inc.length) cond.initiatorDomains = inc;
    if (exc.length) cond.excludedInitiatorDomains = exc;
  }
  if (f.to) {
    const inc = f.to.include.filter(d => !d.endsWith('.*') && isAscii(d));
    const exc = f.to.exclude.filter(d => !d.endsWith('.*') && isAscii(d));
    if (inc.length) cond.requestDomains = inc;
    if (exc.length) cond.excludedRequestDomains = exc;
  }
  if (f.methods) cond.requestMethods = f.methods.filter(m => !m.startsWith('~'));
  if (cond.requestMethods && !cond.requestMethods.length) delete cond.requestMethods;
  // a rule must restrict something; refuse "block everything"
  if (!cond.urlFilter && !cond.regexFilter && !cond.initiatorDomains && !cond.requestDomains && !f.allow && !f.removeparam && !f.csp) return null;
  return cond;
}

function filterToRule(f, opts) {
  if (f.document && f.allow) {
    // @@||site^$document → allow everything on that site
    const m = f.pattern.match(PURE_DOMAIN_RE);
    if (!m) return null;
    return { priority: PRIORITY.IMPORTANT_ALLOW, action: { type: 'allowAllRequests' },
      condition: { requestDomains: [m[1]], resourceTypes: ['main_frame', 'sub_frame'] } };
  }
  const cond = toDnrCondition(f, opts);
  if (!cond) return null;
  if (f.removeparam) {
    if (f.allow) return null;
    const p = f.removeparam;
    if (p === '*' || p.startsWith('/') || p.startsWith('~') || p.includes('|')) return null;
    if (!cond.resourceTypes) { cond.resourceTypes = ['main_frame', 'sub_frame', 'xmlhttprequest']; delete cond.excludedResourceTypes; }
    return { priority: PRIORITY.REMOVEPARAM, action: { type: 'redirect',
      redirect: { transform: { queryTransform: { removeParams: [p] } } } }, condition: cond };
  }
  if (f.csp) {
    if (f.allow || /report-(uri|to)/.test(f.csp)) return null;
    cond.resourceTypes = ['main_frame', 'sub_frame']; delete cond.excludedResourceTypes;
    return { priority: PRIORITY.HEADERS, action: { type: 'modifyHeaders',
      responseHeaders: [{ header: 'content-security-policy', operation: 'append', value: f.csp }] }, condition: cond };
  }
  if (f.redirect !== null) {
    if (f.allow) return null;
    const res = REDIRECTS[f.redirect.split(':')[0]];
    if (!res) {
      if (f.redirectRule || f.redirect === 'none') return null;
      return { priority: f.important ? PRIORITY.IMPORTANT : PRIORITY.BLOCK, action: { type: 'block' }, condition: cond };
    }
    return { priority: PRIORITY.REDIRECT, action: { type: 'redirect', redirect: { extensionPath: '/resources/' + res } }, condition: cond };
  }
  if (f.allow) return { priority: f.important ? PRIORITY.IMPORTANT_ALLOW : PRIORITY.ALLOW, action: { type: 'allow' }, condition: cond };
  return { priority: f.important ? PRIORITY.IMPORTANT : PRIORITY.BLOCK, action: { type: 'block' }, condition: cond };
}

// ---------------------------------------------------------------------------
// Whole-list compilation
// ---------------------------------------------------------------------------
export function emptyCosmetic() {
  return {
    generic: [],            // generic hiding selectors
    specific: {},           // domain -> [selectors]
    exceptions: {},         // domain -> [selectors] (also '*' for global exceptions)
    procedural: {},         // domain -> [procedural selectors]
    styles: {},             // domain -> [[selector, style]]
    scriptlets: {},         // domain -> [[name, ...args]]
    scriptletExceptions: {},// domain -> [name|'*']
    hide: { all: [], generic: [], specific: [] }, // domains where cosmetic is disabled
  };
}

function push(map, key, val) { (map[key] ||= []).push(val); }

/**
 * Compile filter list text.
 * @param {string|string[]} input
 * @param {{forceAllTypes?:boolean, maxRegex?:number, idStart?:number, category?:string}} opts
 */
export function compileFilters(input, opts = {}) {
  const lines = Array.isArray(input) ? input : preprocess(input);
  const maxRegex = opts.maxRegex ?? 900;
  const stats = { total: 0, network: 0, cosmetic: 0, scriptlets: 0, unsupported: 0, rules: 0 };
  const cosmetic = emptyCosmetic();
  const rules = [];
  const domains = new Set();
  const groups = new Map(); // aggregated pure-domain rules
  const bad = new Set();
  const seen = new Set();
  let regexCount = 0;

  for (const l of lines) {
    const t = l.trim();
    if (t.includes('$') && /[$,]badfilter(,|$)/.test(t)) bad.add(t.replace(/,badfilter|badfilter,|\$badfilter$/, '').replace(/\$$/, ''));
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || seen.has(line) || bad.has(line)) continue;
    seen.add(line);
    const f = parseLine(line);
    if (!f) continue;
    stats.total++;
    if (f.kind === 'unsupported') { stats.unsupported++; continue; }

    if (f.kind === 'cosmetic' || f.kind === 'style') {
      stats.cosmetic++;
      const { include, exclude } = f.domains;
      const value = f.kind === 'style' ? [f.selector, f.style] : f.selector;
      if (f.exception) {
        if (f.kind === 'style') continue;
        for (const d of include.length ? include : ['*']) push(cosmetic.exceptions, d, f.selector);
        continue;
      }
      if (!include.length) {
        if (f.kind === 'style' || f.procedural) { stats.unsupported++; continue; } // generic procedural too costly
        cosmetic.generic.push(f.selector);
        for (const d of exclude) push(cosmetic.exceptions, d, f.selector);
        continue;
      }
      const target = f.kind === 'style' ? cosmetic.styles : f.procedural ? cosmetic.procedural : cosmetic.specific;
      for (const d of include) push(target, d, value);
      if (f.kind !== 'style') for (const d of exclude) push(cosmetic.exceptions, d, f.selector);
      continue;
    }

    if (f.kind === 'scriptlet') {
      stats.scriptlets++;
      const { include } = f.domains;
      if (f.exception) {
        for (const d of include.length ? include : ['*']) push(cosmetic.scriptletExceptions, d, f.name);
        continue;
      }
      if (!include.length) { stats.unsupported++; continue; }
      for (const d of include) push(cosmetic.scriptlets, d, [f.name, ...f.args]);
      continue;
    }

    // network
    stats.network++;
    if (f.badfilter) continue;
    if (f.cosmeticHide) {
      if (!f.allow) { stats.unsupported++; continue; }
      const m = f.pattern.match(PURE_DOMAIN_RE);
      const ds = m ? [m[1]] : (f.initiator?.include || []);
      for (const d of ds) cosmetic.hide[f.cosmeticHide].push(d);
      continue;
    }
    if (f.allow && f.document) {
      const m = f.pattern.match(PURE_DOMAIN_RE);
      if (m) { cosmetic.hide.all.push(m[1]); }
    }

    // aggregate simple ||domain^ rules
    const pm = f.regex === null && f.pattern.match(PURE_DOMAIN_RE);
    if (pm && !f.initiator && !f.to && !f.removeparam && !f.csp && f.redirect === null && !f.methods && !f.matchCase && !f.document && !f.cosmeticHide) {
      const types = f.all ? ALL_TYPES : f.types;
      const key = JSON.stringify([f.allow, f.domainType, f.important, [...types].sort(), [...f.notTypes].sort()]);
      if (!groups.has(key)) groups.set(key, { f, list: [] });
      groups.get(key).list.push(pm[1]);
      if (!f.allow) domains.add(pm[1]);
      continue;
    }
    if (f.regex !== null) {
      if (regexCount >= maxRegex) { stats.unsupported++; continue; }
    }
    const rule = filterToRule(f, opts);
    if (!rule) { stats.unsupported++; continue; }
    if (rule.condition.regexFilter) regexCount++;
    rules.push(rule);
  }

  for (const { f, list } of groups.values()) {
    const proto = { ...f, pattern: '||placeholder.invalid^' };
    const rule = filterToRule(proto, opts);
    if (!rule) continue;
    delete rule.condition.urlFilter;
    // chunk huge lists to keep rules reasonably sized
    for (let i = 0; i < list.length; i += 20000) {
      rules.push({ ...rule, condition: { ...rule.condition, requestDomains: [...new Set(list.slice(i, i + 20000))] } });
    }
  }

  let id = opts.idStart ?? 1;
  for (const r of rules) r.id = id++;
  stats.rules = rules.length;
  return { rules, cosmetic, domains: [...domains], stats };
}

/** Merge several cosmetic objects into one (mutates & returns target). */
export function mergeCosmetic(target, src) {
  if (!src) return target;
  target.generic.push(...src.generic);
  for (const k of ['specific', 'exceptions', 'procedural', 'styles', 'scriptlets', 'scriptletExceptions']) {
    for (const [d, arr] of Object.entries(src[k] || {})) (target[k][d] ||= []).push(...arr);
  }
  for (const k of ['all', 'generic', 'specific']) target.hide[k].push(...(src.hide?.[k] || []));
  return target;
}
