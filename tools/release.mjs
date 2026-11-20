// Cuts a new Wipe Ad release.
//   node tools/release.mjs patch|minor|major|<x.y.z> ["release notes EN" ["ملاحظات بالعربية"]]
// - bumps the version (package.json + src/manifest.json)
// - builds dist/ (zips) and resets the live-rule baseline
// - writes updates/version.json, updates/firefox-updates.json, updates/chromium-updates.xml
// Then commit, tag vX.Y.Z and push: the GitHub "release" workflow publishes the zips.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/shared/config.js';
import { alwaysLists } from './make-delta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [bump = 'patch', notesEn = '', notesAr = ''] = process.argv.slice(2);
const pkgPath = join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

function next(v, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [a, b, c] = v.split('.').map(Number);
  return kind === 'major' ? `${a + 1}.0.0` : kind === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}
const version = next(pkg.version, bump);
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const mPath = join(ROOT, 'src', 'manifest.json');
const m = JSON.parse(readFileSync(mPath, 'utf8'));
m.version = version;
writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');
console.log(`→ version ${version}`);

execFileSync(process.execPath, [join(ROOT, 'tools', 'build.mjs')], { stdio: 'inherit' });

const UPD = join(ROOT, 'updates');
const FIL = join(UPD, 'filters');
mkdirSync(FIL, { recursive: true });
copyFileSync(join(ROOT, 'build', 'baseline.txt.gz'), join(FIL, 'baseline.txt.gz'));
// fresh, empty live-rule manifest for this baseline (keeps hand-written hot fixes)
const prev = existsSync(join(FIL, 'manifest.json')) ? JSON.parse(readFileSync(join(FIL, 'manifest.json'), 'utf8')) : {};
for (const l of prev.lists || []) if (l.url.startsWith('delta-')) rmSync(join(FIL, l.url), { force: true });
rmSync(join(FIL, 'NEEDS_RELEASE'), { force: true });
const fixes = alwaysLists(FIL);
writeFileSync(join(FIL, 'manifest.json'), JSON.stringify({
  version: `${version}-0`, generated: new Date().toISOString(), baselineVersion: version, lists: fixes,
  yellowlist: prev.yellowlist || [], consentRules: prev.consentRules || [], notice: prev.notice || null,
}, null, 1));

const repo = CONFIG.RELEASES_URL.replace(/\/releases\/latest$/, '');
const dl = t => `${repo}/releases/download/v${version}/wipe-ad-${version}-${t}.zip`;
writeFileSync(join(UPD, 'version.json'), JSON.stringify({
  version, released: new Date().toISOString(), page: `${repo}/releases/tag/v${version}`,
  notes: { en: notesEn || `Wipe Ad ${version}`, ar: notesAr || notesEn || `الإصدار ${version}` },
  download: { chromium: dl('chromium'), firefox: dl('firefox') },
}, null, 2));

// Firefox self-hosted update manifest (needs an AMO-signed .xpi attached to the release)
const ffPath = join(UPD, 'firefox-updates.json');
const ff = existsSync(ffPath) ? JSON.parse(readFileSync(ffPath, 'utf8')) : { addons: { 'wipe-ad@wipe-ad.app': { updates: [] } } };
const ups = ff.addons['wipe-ad@wipe-ad.app'].updates.filter(u => u.version !== version);
ups.push({ version, update_link: `${repo}/releases/download/v${version}/wipe-ad-${version}-firefox.xpi`, applications: { gecko: { strict_min_version: '128.0' } } });
ff.addons['wipe-ad@wipe-ad.app'].updates = ups.slice(-10);
writeFileSync(ffPath, JSON.stringify(ff, null, 2));

// Chromium/Edge self-hosted update manifest (needs a CRX signed with your private key; see README)
const appId = process.env.WIPEAD_CHROME_ID || 'REPLACE_WITH_EXTENSION_ID';
writeFileSync(join(UPD, 'chromium-updates.xml'), `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${appId}'>
    <updatecheck codebase='${repo}/releases/download/v${version}/wipe-ad-${version}-chromium.crx' version='${version}' />
  </app>
</gupdate>
`);

console.log(`\nRelease ${version} prepared. Next:\n  git add -A && git commit -m "Release v${version}"\n  git tag v${version} && git push && git push --tags`);
