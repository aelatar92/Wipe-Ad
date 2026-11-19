# Wipe Ad

إضافة متصفح واحدة (Manifest V3 — Chrome / Edge / Brave / Opera / Firefox) تجمع وظائف
**uBlock Origin + AdGuard + Privacy Badger + Ghostery** مع **تحديث تلقائي** للإضافة وللقواعد.

> تقرير الهندسة العكسية للأدوات الأربع: [research/ANALYSIS.md](research/ANALYSIS.md)

## المزايا

| الفئة | الوظيفة | مستوحاة من |
|---|---|---|
| الحجب الشبكي | 22 قائمة فلاتر مُجمّعة إلى DNR (EasyList, EasyPrivacy, uBlock, AdGuard Base, PGL, URLhaus, Phishing, Liste AR العربية…) | uBO Lite / AdGuard |
| إخفاء العناصر | تجميلي عام "كسول" (يطبّق فقط ما يطابق class/id الموجودة) + خاص بكل موقع + فلاتر إجرائية (`:has-text`, `:upward`, `:remove`, `:style`…) | uBO |
| Scriptlets | 25 scriptlet مكتوبة من الصفر (set-constant, json-prune, abort-on-property-read, no-fetch-if, nowoif…) + بدائل (surrogates) لـ GA/GTM/GPT/AdSense | uBO / AdGuard |
| أوضاع لكل موقع | أساسي / قياسي / صارم (يحجب سكربتات وإطارات الطرف الثالث) + إيقاف مؤقت 30 دقيقة | uBOL |
| أدوات | منتقي العناصر (Alt+Shift+P)، الممحاة Zapper (Alt+Shift+Z)، قائمة السياق | uBO / AdGuard |
| وضع التخفي | GPC + DNT، حذف X-Client-Data، إخفاء الـ Referrer وكلمات البحث، إزالة utm/fbclid/gclid، حجب ping، WebRTC | AdGuard |
| الكوكيز | تدمير كوكيز المتتبعين تلقائياً، حذف كوكيز الطرف الثالث (اختياري) | AdGuard |
| التعلّم الذاتي | أي طرف ثالث يتتبعك بكوكيز عالية الإنتروبيا على 3 مواقع ← يُحجب (أو تُحجب كوكيزه فقط إن كان CDN ضرورياً) | Privacy Badger |
| نوافذ الكوكيز | رفض تلقائي لـ 23 منصة CMP (OneTrust, Cookiebot, Didomi, Quantcast, Usercentrics…) + كشف ذكي لأزرار "رفض الكل" بعدة لغات منها العربية | Ghostery Never-Consent |
| الحماية | صفحة تحذير للمواقع الضارة والتصيد مع "المتابعة على أي حال" | uBO strict-block |
| الشفافية | عدّاد على الأيقونة، تصنيف المتتبعين (إعلانات/تتبع/ضار/…)، سجل فلترة حي، إحصائيات | Ghostery / AdGuard |
| قواعدي | محرر فلاتر بصيغة ABP/uBO/AdGuard، اشتراك بقوائم مخصصة و`abp:subscribe` | الكل |
| أخرى | واجهة عربية/إنجليزية (RTL)، وضع داكن، نسخ احتياطي/استعادة | — |

## التحديث التلقائي (3 مستويات)

1. **تحديث الإضافة نفسها**
   - من المتجر (Chrome Web Store / Edge Add-ons / AMO) — يتم تلقائياً، والإضافة تستدعي `runtime.requestUpdateCheck()` وتعيد التحميل فور توفر النسخة.
   - توزيع ذاتي: Firefox عبر `update_url` ← `updates/firefox-updates.json`، و Chromium/Edge عبر `npm run build -- --selfhosted` ← `updates/chromium-updates.xml`.
   - فحص دوري لملف `updates/version.json` كل 6 ساعات ← إشعار + شارة في الواجهة + رابط التحميل.
2. **تحديث القواعد الحي (بدون إصدار جديد)** — GitHub Action يعمل كل 6 ساعات (`tools/make-delta.mjs`)
   يقارن القوائم الأصلية بما تم تضمينه في آخر إصدار وينشر *الفلاتر الجديدة فقط* في `updates/filters/`.
   الإضافة تحمّلها، تتحقق من SHA-256، تحولها محلياً إلى قواعد DNR ديناميكية + بيانات تجميلية.
3. **إصلاحات فورية**: أي سطر تضيفه في `updates/filters/wipead-fixes.txt` يصل لكل المستخدمين خلال ساعات.

```
src/shared/config.js → UPDATE_BASE   (مكان مجلد updates/ — GitHub raw افتراضياً)
```

## البناء والتجربة

```powershell
npm run build
```
ينتج `dist/chromium` و `dist/firefox` و ملفات zip. (يحتاج Node 20+، بدون أي مكتبات خارجية.)

- **Chrome/Edge:** `chrome://extensions` ← وضع المطوّر ← "تحميل إضافة غير مضغوطة" ← `dist/chromium`
- **Firefox:** `about:debugging#/runtime/this-firefox` ← "تحميل إضافة مؤقتة" ← `dist/firefox/manifest.json`
  (في Firefox يجب منح صلاحية "الوصول لكل المواقع" من إعدادات الإضافة.)

```powershell
npm test
```
```powershell
npm run e2e
```
اختبار شامل يشغّل الإضافة في Chromium حقيقي (28 فحص: حجب، تجميلي، رفض الكوكيز، إزالة utm، الواجهات، التحديث الحي، العربية).

## إصدار نسخة جديدة

```powershell
npm run release -- minor "New: feature X" "جديد: ميزة X"
```
ثم `git commit` و `git tag vX.Y.Z` و `git push --tags` ← GitHub Action يبني وينشر الحزم، وكل المستخدمين يُبلَّغون تلقائياً.

## الهيكل

```
src/
  background/   index.js (نقطة الدخول) · rules.js · stealth.js · learning.js · cosmetic.js
                stats.js · filters.js · updater.js · settings.js · data.js
  content/      main.js (تجميلي + نوافذ الكوكيز + abp:subscribe) · picker.js · gpc-main.js
  scriptlets/   scriptlets.js (تعمل داخل الصفحة MAIN world)
  shared/       filter-parser.js (مترجم الفلاتر → DNR) · domain.js (PSL) · config.js
  ui/           popup · dashboard · blocked (صفحة التحذير) · i18n (عربي/إنجليزي)
tools/          build · make-delta · release · regex-validator (RE2 عبر Chromium) · zip · make-icons
updates/        version.json · filters/manifest.json · firefox-updates.json · chromium-updates.xml
```

## الترخيص والمصادر
الكود مكتوب بالكامل لهذا المشروع (لم يُنسخ كود من الإضافات المُحلَّلة). قوائم الفلاتر ملك أصحابها وتخضع
لتراخيصها (EasyList: GPLv3/CC BY-SA 3.0، uBlock filters: GPLv3، AdGuard filters: GPLv3، URLhaus: CC0…) — انظر صفحة "حول" في الإضافة.
