import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFilters, parseLine, preprocess, parseArgs } from '../src/shared/filter-parser.js';
import { setPublicSuffixList, getBaseDomain, hostKeys, getEntity } from '../src/shared/domain.js';
globalThis.chrome ??= { declarativeNetRequest: {} };
const { compareVersions } = await import('../src/background/updater.js');

test('pure domain rules are aggregated into one requestDomains rule', () => {
  const { rules, domains } = compileFilters('||ads.example.com^\n||track.example.net^\n||x.org^$third-party');
  const agg = rules.find(r => r.condition.requestDomains?.includes('ads.example.com'));
  assert.ok(agg);
  assert.deepEqual(agg.condition.requestDomains.sort(), ['ads.example.com', 'track.example.net']);
  assert.equal(agg.action.type, 'block');
  const tp = rules.find(r => r.condition.requestDomains?.includes('x.org'));
  assert.equal(tp.condition.domainType, 'thirdParty');
  assert.equal(domains.length, 3);
});

test('options map to DNR conditions', () => {
  const { rules } = compileFilters('/banner/*$script,image,domain=a.com|~b.a.com,third-party\n@@||cdn.com/ok.js$script\n||imp.com^$important');
  const r = rules.find(x => x.condition.urlFilter === '/banner/*');
  assert.deepEqual(r.condition.resourceTypes, ['script', 'image']);
  assert.deepEqual(r.condition.initiatorDomains, ['a.com']);
  assert.deepEqual(r.condition.excludedInitiatorDomains, ['b.a.com']);
  const allow = rules.find(x => x.action.type === 'allow');
  assert.equal(allow.condition.urlFilter, '||cdn.com/ok.js');
  const imp = rules.find(x => x.condition.requestDomains?.includes('imp.com'));
  assert.ok(imp.priority > allow.priority);
});

test('redirect, removeparam, csp', () => {
  const { rules } = compileFilters('||google-analytics.com/analytics.js$script,redirect=google-analytics_analytics.js\n$removeparam=utm_source\n||site.com^$csp=script-src \'self\'');
  assert.equal(rules.find(r => r.action.type === 'redirect' && r.action.redirect.extensionPath)?.action.redirect.extensionPath, '/resources/ga.js');
  assert.deepEqual(rules.find(r => r.action.redirect?.transform)?.action.redirect.transform.queryTransform.removeParams, ['utm_source']);
  assert.equal(rules.find(r => r.action.type === 'modifyHeaders')?.action.responseHeaders[0].value, "script-src 'self'");
});

test('cosmetic and scriptlet filters', () => {
  const { cosmetic } = compileFilters([
    '##.ad-banner', 'example.com##.sponsored', '~safe.com##.promo', 'example.com#@#.ad-banner',
    'example.com##+js(set-constant, adBlocked, false)', "news.com#%#//scriptlet('abort-on-property-read', 'adsbygoogle')",
    'example.com##div:has-text(Sponsored)', 'example.com#$#body { overflow: auto !important; }', 'google.*##.ads',
  ].join('\n'));
  assert.ok(cosmetic.generic.includes('.ad-banner'));
  assert.ok(cosmetic.generic.includes('.promo'));
  assert.deepEqual(cosmetic.exceptions['safe.com'], ['.promo']);
  assert.deepEqual(cosmetic.exceptions['example.com'], ['.ad-banner']);
  assert.deepEqual(cosmetic.specific['example.com'], ['.sponsored']);
  assert.deepEqual(cosmetic.scriptlets['example.com'][0], ['set-constant', 'adBlocked', 'false']);
  assert.deepEqual(cosmetic.scriptlets['news.com'][0], ['abort-on-property-read', 'adsbygoogle']);
  assert.deepEqual(cosmetic.procedural['example.com'], ['div:has-text(Sponsored)']);
  assert.deepEqual(cosmetic.styles['example.com'][0], ['body', 'overflow: auto !important;']);
  assert.deepEqual(cosmetic.specific['google.*'], ['.ads']);
});

test('badfilter, hosts format, unsupported', () => {
  const { rules, stats } = compileFilters('||bad.com^\n||bad.com^$badfilter\n0.0.0.0 evil.net\n||x.com^$popup\n##^script:has-text(ad)');
  assert.ok(!rules.some(r => r.condition.requestDomains?.includes('bad.com')));
  assert.ok(rules.some(r => r.condition.requestDomains?.includes('evil.net')));
  assert.ok(stats.unsupported >= 2);
});

test('network filters with # are not mistaken for cosmetic', () => {
  assert.equal(parseLine('||example.com/#ad$script').kind, 'network');
  assert.equal(parseLine('example.com##.x').kind, 'cosmetic');
});

test('preprocessor', () => {
  const out = preprocess('a\n!#if env_firefox\nb\n!#else\nc\n!#endif\n!#if !env_mobile && env_chromium\nd\n!#endif');
  assert.deepEqual(out.filter(Boolean), ['a', 'c', 'd']);
});

test('scriptlet args parsing', () => {
  assert.deepEqual(parseArgs("'a, b', c\\, d, e"), ['a, b', 'c, d', 'e']);
});

test('domain helpers', () => {
  setPublicSuffixList({ r: ['com', 'uk', 'co.uk', 'eg', 'com.eg'], w: [], e: [] });
  assert.equal(getBaseDomain('a.b.example.co.uk'), 'example.co.uk');
  assert.equal(getBaseDomain('www.masrawy.com.eg'), 'masrawy.com.eg');
  assert.equal(getEntity('www.google.co.uk'), 'google.*');
  assert.deepEqual(hostKeys('www.google.co.uk'), ['www.google.co.uk', 'google.co.uk', 'www.google.*', 'google.*']);
});

test('version comparison', () => {
  assert.equal(compareVersions('1.2.10', '1.2.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
});
