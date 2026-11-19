# تحليل أدوات حجب الإعلانات — تقرير الهندسة العكسية

> التاريخ: 2026-11-20 · الأداة: REA (`analyze_javascript_application`) + قراءة موجّهة للكود
> كل الحزم حُمِّلت من صفحات الإصدارات الرسمية على GitHub وحُلِّلت تحليلاً ساكناً فقط (لم يُشغَّل أي كود منها).

## 1. الحزم التي تم تحليلها

| الأداة | الإصدار | المصدر | Manifest | الرخصة |
|---|---|---|---|---|
| uBlock Origin | 1.76.4 | `gorhill/uBlock` (chromium.zip) | MV2 | GPL-3.0 |
| uBlock Origin Lite | 2026.1116.1650 | `uBlockOrigin/uBOL-home` | MV3 | GPL-3.0 |
| AdGuard AdBlocker | 5.5.4.55 | `AdguardTeam/AdguardBrowserExtension` (chrome-mv3.zip) | MV3 | GPL-3.0 |
| Privacy Badger | 2026.9.15 | `EFForg/privacybadger` (tag tarball) | MV2 | GPL-3.0 |
| Ghostery | 10.6.13 | `ghostery/ghostery-extension` (chromium.zip) | MV3 | MPL-2.0 |

ملاحظة: Chrome أوقف دعم MV2، لذا حلّلنا uBO Lite (نسخة MV3 الرسمية من uBlock) بجانب uBO الكلاسيكي.

### سجل أدلة REA (Evidence IDs)
| الهدف | Evidence (parent) | ما تم تحليله |
|---|---|---|
| Privacy Badger | `ev_6985e466…bc82` | background, heuristicblocking, webrequest, storage, surrogates, socialwidgetloader, tabdata — 7 ملفات، 16,380 عقدة AST |
| Ghostery | `ev_e08d0b9d…c713` | background/index, adblocker, dnr, config, exceptions, redirect-protection, never-consent, stats, custom-filters — 214 finding |
| uBO Lite | `ev_b00bcaaf…1417` | background, ruleset-manager, scripting-manager, mode-manager, filter-manager, config, alarms — 345 ملف مصدر في المخزون |
| AdGuard | `ev_f96fce20…9908` | content-script-start/end, gpc, hide-document-referrer (حزمة background.js بحجم 8.3MB مجمّعة بـ webpack خارج نطاق REA بسبب حد الذاكرة، فحُلِّلت بالبحث النصي) |

حدود التحليل (من REA): التحليل ساكن، لا يثبت التنفيذ الفعلي؛ العلاقات عبر الملفات غير المختارة تبقى "unknown"؛ أول محاولة لتحليل الشجرة كاملة لـ uBOL فشلت بسبب حجم ملفات القواعد (~1GB تمثيل) فتم تضييق النطاق للملفات الأساسية.

---

## 2. هيكل وطريقة عمل كل أداة

### 2.1 uBlock Origin (MV2) / uBO Lite (MV3)
**الهيكل (uBOL):**
- `js/background.js` (service worker, ES module) ← `ruleset-manager.js`, `mode-manager.js`, `scripting-manager.js`, `filter-manager.js`.
- `rulesets/main/*.json`: **56 ruleset** مُجمَّعة مسبقاً كـ DNR (EasyList, EasyPrivacy, uBlock filters, PGL, badware, URLhaus، قوائم إقليمية منها `ara-0` العربية، قوائم Annoyances).
- `rulesets/scripting/{generic,specific,scriptlet,popup}`: ملفات JS مولّدة وقت البناء تحمل CSS التجميلي والـ scriptlets، تُسجَّل ديناميكياً عبر `scripting.registerContentScripts`.
- `rulesets/strictblock`, `urlskip`: حجب صارم للمواقع الضارة + تخطي روابط التتبع الوسيطة.

**طريقة العمل:**
- كل الحجب الشبكي عبر `declarativeNetRequest` (بدون webRequest blocking).
- **أوضاع الفلترة لكل موقع** (`mode-manager.js`): `MODE_NONE=0`, `MODE_BASIC=1` (شبكي فقط), `MODE_OPTIMAL=2` (+ تجميلي)، `MODE_COMPLETE=3` (+ كل شيء). يتم البحث بالهوست وآبائه.
- تحويل مُدمج للقواعد (مثلاً `requestDomains` بآلاف الدومينات في قاعدة واحدة) لتوفير حصة القواعد.
- أدوات: element picker، zapper (حذف مؤقت لعنصر)، unpicker، محرر DNR، backup/restore.

**uBO MV2 الكلاسيكي يضيف:** dynamic filtering matrix، مفاتيح لكل موقع (منع popups، منع الخطوط البعيدة، تعطيل JS، منع الوسائط الكبيرة)، logger، تجميل عام كسول (يمسح class/id في DOM ويطبق المطابق فقط)، HTML filtering وكشف CNAME (فايرفوكس).

### 2.2 AdGuard (MV3)
**الهيكل:** `pages/background.js` (webpack, 8.3MB، يحوي محرك `tsurlfilter`)، `content-script-start.js`/`content-script-end.js` (تجميلي + extended CSS)، `assistant-inject.js` (منتقي العناصر)، `filtering-log.js`، `fullscreen-user-rules.js`، `devtools-elements-sidebar.js`، `subscribe.js`، `gpc.js`، `hide-document-referrer.js`.
- `filters/declarative/ruleset_*`: **53 ruleset** DNR مُعطّلة افتراضياً وتُفعَّل حسب اختيار المستخدم.

**الوظائف المكتشفة:**
- **Stealth Mode** (من النصوص في الحزمة): `hideReferrer`, `hideSearchQueries`, `sendDoNotTrack` + GPC، `blockChromeClientData` (حذف ترويسة X-Client-Data)، `stripTrackingParam`، `selfDestructFirstPartyCookies`/`selfDestructThirdPartyCookies` مع مدة زمنية.
- **Filtering log** حي لكل تبويب، **user rules** بمحرر كامل الشاشة، **devtools sidebar**.
- **Subscribe**: التقاط روابط `abp:subscribe?location=` من الصفحات للاشتراك بقوائم.
- تحديث القوائم من `filters.adtidy.org/extension/...`.
- يستخدم `declarativeNetRequestFeedback` لمعرفة القاعدة المطابقة، و`userScripts` لحقن السكربتات.

### 2.3 Privacy Badger (EFF)
**الهيكل:** `js/background.js`, `heuristicblocking.js`, `webrequest.js`, `storage.js`, `surrogates.js`, `socialwidgetloader.js`، و`contentscripts/` (fingerprinting, supercookie, clobbercookie, socialwidgets, dnt).

**الفكرة الجوهرية — التعلّم الذاتي (heuristicblocking.js):**
1. يراقب كل طلب طرف-ثالث عبر webRequest.
2. يحسب **إنتروبيا الكوكيز** (`hasCookieTracking`): أي قيمة كوكي غير موجودة في جدول القيم منخفضة الإنتروبيا (`"yes"`, `"0"`, رموز اللغات…) = تتبع؛ أو مجموع الإنتروبيا > `MAX_COOKIE_ENTROPY = 12` بت.
3. `_recordPrevalence(tracker_fqdn, tracker_base, site_base)`: يسجل في `snitch_map` كل موقع طرف-أول ظهر عليه المتتبع.
4. عند ظهوره على **`TRACKING_THRESHOLD = 3`** مواقع مختلفة ← `blocklistDomain` ← حظر (`block`) أو حظر الكوكيز فقط (`cookieblock`) إن كان الدومين في القائمة الصفراء (CDNs ضرورية).
5. حالات المستخدم: `user_allow`, `user_block`, `user_cookieblock` تتجاوز التعلّم.
- كشف **canvas fingerprinting** و**supercookies** (localStorage)، استبدال أزرار الشبكات الاجتماعية بعناصر "انقر للتحميل"، **surrogates** (سكربتات بديلة لمنع كسر المواقع)، احترام سياسة DNT.

### 2.4 Ghostery (MV3)
**الهيكل:** `background/index.js` ← `adblocker/{engines,network,cosmetics,content-scripts}.js`, `dnr.js`, `never-consent/{autoconsent,gpc}.js`, `redirect-protection.js`, `exceptions.js`, `stats.js`, `custom-filters/`, `paused.js`, `pause-assistant.js`, `serp.js`, `youtube.js`, `telemetry/`, `reporting/`.
- مكتبات: `@ghostery/adblocker` (محرك فلاتر مضغوط)، `@ghostery/urlfilter2dnr`، `@duckduckgo/autoconsent`، `@whotracksme/reporting`.
- `rule_resources/dnr-{ads,tracking,annoyances,fixes,lang-*}.json`.

**الوظائف:**
- `updateEngines()` (engines.js:59): تحميل محركات مُجمَّعة من `cdn.ghostery.com/adblocker/configs` ثم `trackerdb` ← تحديث استثناءات DNR — **تحديث القواعد بدون تحديث الإضافة**.
- **Never-Consent**: الرفض التلقائي لنوافذ الكوكيز (autoconsent).
- **Trackers preview** على صفحات نتائج البحث + **WhoTracks.Me** لتصنيف المتتبعين (إعلانات، تحليلات، اجتماعي…).
- **Redirect protection**: تحذير عند المرور بروابط تتبع وسيطة.
- **Pause site**، **Pause assistant**، حماية YouTube، element picker، "zapped" عناصر، إحصائيات.

---

## 3. مصفوفة المزايا ← قرار Wipe Ad

| الميزة | uBO/uBOL | AdGuard | Badger | Ghostery | Wipe Ad |
|---|:-:|:-:|:-:|:-:|:-:|
| حجب شبكي DNR بقوائم مدمجة | ✔ | ✔ | – | ✔ | ✔ |
| تجميلي (CSS) عام + خاص | ✔ | ✔ | – | ✔ | ✔ |
| Scriptlets | ✔ | ✔ | (surrogates) | ✔ | ✔ |
| أوضاع لكل موقع | ✔ | – | – | – | ✔ (Off/Standard/Strict) |
| Element picker / Zapper | ✔ | ✔ | – | ✔ | ✔ |
| قواعد المستخدم | ✔ | ✔ | – | ✔ | ✔ |
| Filtering log | ✔ | ✔ | – | ✔ | ✔ |
| Stealth (Referrer, GPC/DNT, X-Client-Data, Tracking params) | جزئي | ✔ | GPC/DNT | GPC | ✔ |
| حذف الكوكيز التلقائي | – | ✔ | – | – | ✔ |
| التعلم الذاتي للمتتبعين | – | – | ✔ | – | ✔ |
| رفض الكوكيز التلقائي | قوائم | قوائم | – | ✔ | ✔ |
| حماية من المواقع الضارة (صفحة تحذير) | ✔ | ✔ | – | – | ✔ |
| تصنيف المتتبعين | – | – | – | ✔ | ✔ |
| الإيقاف المؤقت للموقع | ✔ | ✔ | ✔ | ✔ | ✔ |
| الاشتراك بـ abp:subscribe | ✔ | ✔ | – | – | ✔ |
| تحديث القواعد عن بُعد بدون إصدار جديد | جزئي | ✔ | ✔ | ✔ | ✔ |
| تحديث تلقائي للإضافة نفسها | Store | Store | Store | Store | ✔ (Store + update_url + فحص إصدار) |
| واجهة عربية RTL | ✔ | ✔ | ✔ | ✔ | ✔ |

## 4. قرارات التصميم المأخوذة من التحليل
1. **MV3 فقط** (Chromium + Firefox) مثل uBOL/AdGuard/Ghostery لأن MV2 انتهى في Chrome.
2. **ثلاث طبقات للقواعد** (مستوحاة من Ghostery engines + uBOL rulesets):
   - *Static rulesets* تُجمَّع وقت البناء من القوائم الأصلية.
   - *Delta rules* تُنشر يومياً من مستودعنا وتُطبَّق كقواعد ديناميكية — هذا هو "التحديث التلقائي للإضافات الجديدة".
   - *User rules* من المستخدم.
3. **دمج الدومينات** في قاعدة واحدة `requestDomains` (تقنية uBOL) لتوفير حصة DNR.
4. **التعلم على طريقة Badger** باستخدام webRequest للمراقبة فقط (مسموح في MV3)، وتحويل النتيجة لقاعدتين DNR فقط (block + cookieblock) مهما زاد عدد الدومينات.
5. **Stealth على طريقة AdGuard** بقواعد `modifyHeaders` و`queryTransform`.
6. **التجميلي العام الكسول** (فكرة uBO): السكربت يجمع class/id من DOM ويطلب المطابق فقط بدلاً من حقن 20 ألف selector.
7. **كتبنا كل الكود بأنفسنا** (بدون نسخ كود GPL/MPL) — نستخدم فقط *قوائم الفلاتر* العامة كبيانات، مع ذكر مصادرها.
