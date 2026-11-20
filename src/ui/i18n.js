// Wipe Ad — UI translations (Arabic / English) with runtime language switching.
export const STRINGS = {
  en: {
    on: 'On', off: 'Off', enabledHere: 'Protection is ON for this site', disabledHere: 'Protection is OFF for this site',
    pausedHere: 'Paused until', globalOff: 'Wipe Ad is turned off everywhere', turnOnEverywhere: 'Turn on',
    blockedPage: 'Blocked on this page', blockedTotal: 'Blocked in total', cookieBanners: 'Cookie banners refused',
    mode: 'Filtering mode', modeBasic: 'Basic', modeStandard: 'Standard', modeStrict: 'Strict',
    modeBasicHint: 'Network blocking only — fastest, fewest site issues.',
    modeStandardHint: 'Network + element hiding + scriptlets. Recommended.',
    modeStrictHint: 'Also blocks third-party scripts, frames & fonts on this site.',
    picker: 'Block element', zapper: 'Zap element', pause: 'Pause 30 min', resume: 'Resume', dashboard: 'Dashboard', log: 'Log',
    trackers: 'Trackers & third parties on this page', noTrackers: 'Nothing detected yet.',
    cat_a: 'Advertising', cat_t: 'Tracking', cat_m: 'Malware', cat_n: 'Annoyance', cat_s: 'Social', cat_o: 'Other',
    blocked: 'blocked', allowed: 'allowed',
    updateAvailable: 'Update available', getUpdate: 'Get update', notWebPage: 'Wipe Ad works on web pages (http/https).',
    // dashboard
    navOverview: 'Overview', navLists: 'Filter lists', navMyFilters: 'My filters', navSites: 'Sites', navPrivacy: 'Privacy',
    navLearning: 'Tracker learning', navLog: 'Filtering log', navUpdates: 'Updates', navSettings: 'Settings', navAbout: 'About',
    welcomeTitle: 'Welcome to Wipe Ad 👋', welcomeBody: 'You are protected. Ads, trackers, malware and cookie banners are blocked out of the box. Explore the sections to customize.',
    statBlocked: 'Requests blocked', statAds: 'Ads', statTrackers: 'Trackers', statMalware: 'Malware', statBanners: 'Cookie banners', statSince: 'since',
    resetStats: 'Reset statistics', masterSwitch: 'Wipe Ad protection', masterHint: 'Turn all filtering on or off everywhere.',
    group_ads: 'Ads', group_privacy: 'Privacy', group_malware: 'Malware & phishing', group_annoyances: 'Annoyances', group_regions: 'Regional',
    rules: 'rules', cosmeticRules: 'cosmetic', listHome: 'Home page', customLists: 'Custom subscriptions', addList: 'Add',
    customListPlaceholder: 'https://example.com/filters.txt', removeList: 'Remove', ruleBudget: 'Rule usage',
    myFiltersHint: 'One filter per line. Supports Adblock Plus / uBlock Origin / AdGuard syntax: ||ads.example.com^, example.com##.banner, example.com##+js(set-constant, foo, false)',
    save: 'Save', saved: 'Saved', test: 'Check syntax', accepted: 'accepted', unsupported: 'unsupported',
    allowlist: 'Disabled sites (allowlist)', allowlistHint: 'One domain per line. Wipe Ad does nothing on these sites.',
    siteModes: 'Per-site modes', noSiteModes: 'No custom modes. Change them from the toolbar popup.',
    privacyStealth: 'Stealth mode', gpc: 'Send "Do Not Sell / Do Not Track" signals (GPC + DNT)',
    removeXClientData: 'Remove the X-Client-Data header Chrome sends to Google',
    hideReferrer: 'Hide referrer from third parties', hideSearchQueries: 'Hide your search queries from the sites you visit',
    stripTrackingParams: 'Remove tracking parameters from links (utm_*, fbclid, gclid…)', blockPings: 'Block hyperlink auditing pings',
    stripThirdPartyCookies: 'Strip all third-party cookies (may break logins on some sites)',
    autoDeleteTrackerCookies: 'Self-destruct tracker cookies (every 15 min)', cleanNow: 'Clean now', cookiesRemoved: 'cookies removed',
    blockWebRTC: 'Prevent WebRTC from leaking your real IP', needsPermission: 'requires extra permission',
    autoConsent: 'Automatically refuse cookie consent pop-ups', malwareWarning: 'Show a warning page for malicious & phishing sites',
    cosmetic: 'Hide ad placeholders and page clutter (element hiding)', scriptlets: 'Defuse anti-adblock & ad scripts (scriptlets)',
    learningOn: 'Learn new trackers automatically', learningHint: 'Like Privacy Badger: a third party that tracks you with cookies on several sites gets blocked automatically.',
    threshold: 'Block after being seen on', sites: 'sites', domain: 'Domain', seenOn: 'Seen on', status: 'Status', action: 'Your choice',
    actDefault: 'Automatic', actBlock: 'Block', actCookieblock: 'Block cookies', actAllow: 'Allow', resetLearning: 'Forget everything learned',
    learnEmpty: 'Nothing learned yet. Browse normally — Wipe Ad watches for trackers.',
    tab: 'Tab', allTabs: 'All tabs', clear: 'Clear', pauseLog: 'Pause', time: 'Time', type: 'Type', url: 'URL', category: 'Category',
    filterPlaceholder: 'Filter…', st_blocked: 'Blocked', st_allowed: 'Allowed', st_redirected: 'Redirected', st_cleaned: 'Cleaned',
    currentVersion: 'Installed version', latestVersion: 'Latest version', lastCheck: 'Last check', never: 'never',
    checkNow: 'Check for updates now', checking: 'Checking…', upToDate: 'You are up to date ✓', autoUpdateExtension: 'Update Wipe Ad automatically',
    autoUpdateFilters: 'Update filter rules automatically (no reinstall needed)', updateInterval: 'Check every',
    hours: 'hours', remoteRules: 'Live rule updates', rulesVersion: 'Rules version', notApplied: 'not yet downloaded',
    language: 'Language', langAuto: 'Automatic', showBadge: 'Show blocked count on the toolbar icon',
    backup: 'Backup & restore', exportBtn: 'Export settings', importBtn: 'Import settings', imported: 'Imported ✓',
    shortcuts: 'Keyboard shortcuts', aboutBody: 'Wipe Ad combines the best ideas of uBlock Origin, AdGuard, Privacy Badger and Ghostery in one lightweight Manifest V3 extension. Filter lists are maintained by their respective authors.',
    credits: 'Filter lists used', confirmSubscribe: 'Subscribe to this filter list?', subscribe: 'Subscribe', cancel: 'Cancel',
    // v1.1
    navDiagnostics: 'Diagnostics', diagHint: 'Errors, slow operations and possible over-blocking detected by Wipe Ad. Export this file when reporting a problem.',
    navReport: 'Weekly report', navFocus: 'Focus & family', fpDetected: 'Fingerprinting attempts on this page', fpProtected: 'blurred', fpDetectedOnly: 'detected',
    api_canvas: 'Canvas', api_webgl: 'WebGL', api_audio: 'Audio', api_fonts: 'Fonts',
    siteBroken: 'Site not working?', brokenBasic: 'Switch to Basic mode', brokenOff: 'Turn off on this site', brokenReport: 'Report to developers',
    secAnnoyances: 'Annoyances', secAdvanced: 'Advanced protection',
    skipRedirects: 'Skip tracking redirects (Facebook, Google, YouTube… links go straight to the site)',
    fpDetect: 'Detect fingerprinting scripts', antiFingerprint: 'Blur my fingerprint (canvas, WebGL, audio noise)',
    blockNotificationPrompts: 'Block "Allow notifications?" prompts', stopAutoplay: 'Stop videos from auto-playing',
    hideNewsletters: 'Hide newsletter pop-ups, chat widgets and other clutter', serpBadges: 'Show warnings & tracker counts next to search results',
    weeklyReport: 'Weekly privacy report notification',
    cnameUncloak: 'Uncover trackers hidden behind the site\'s own subdomains (CNAME)',
    cnameHint: 'On Chrome/Edge the subdomain names are checked through Cloudflare DNS-over-HTTPS.', cnameFound: 'hidden trackers found',
    reportTitle: 'Your privacy this week', vsLastWeek: 'vs last week', savedData: 'Data saved (estimate)', savedTime: 'Loading time saved (estimate)',
    topBlocked: 'Most blocked trackers', worstSites: 'Sites with the most trackers', mb: 'MB', minutes: 'min', seconds: 'sec',
    statFingerprinting: 'Fingerprinting attempts', statSkipped: 'Tracking links skipped', noData: 'Not enough data yet — check back in a few days.',
    focusMode: 'Focus mode', focusHint: 'Block distracting sites during your work hours.', focusSites: 'Distracting sites (one per line)',
    focusDays: 'Days', focusFrom: 'From', focusTo: 'To', focusAllDay: 'All day', focusActiveNow: 'Focus is active now',
    safeMode: 'Family safe mode', safeModeHint: 'Blocks adult websites and forces SafeSearch on Google, Bing, DuckDuckGo and YouTube.',
    syncTitle: 'Sync across devices', syncEnabled: 'Sync my settings, filters and tracker choices with my browser account', syncNow: 'Sync now', lastSync: 'Last sync',
    aiTitle: 'AI filter assistant', aiHint: 'Describe what to hide in the element picker ("the sidebar with videos") and Claude writes the filter. Uses your own Anthropic API key; the page structure (not your data or cookies) is sent to Anthropic only when you ask.',
    aiKey: 'Anthropic API key', aiKeySaved: 'Key saved on this device only', aiUnavailable: 'Not included in this build', getKey: 'Get a key',
    managedBanner: 'Some settings are managed by your organization.',
    skipFailed: 'Wipe Ad could not find the destination of this tracking link.', continue: 'Continue to the link',
    focusTitle: 'Time to focus', focusBody: 'This site is blocked during your focus hours.', focusUntil: 'Focus ends at', focusSettings: 'Focus settings',
    // blocked page
    dangerTitle: 'Dangerous site blocked', dangerBody: 'Wipe Ad blocked this page because it is listed as malicious, phishing or unwanted.',
    goBack: 'Go back to safety', proceed: 'Proceed anyway (not recommended)', alwaysAllow: 'Always allow this site', blockedUrl: 'Blocked address',
  },
  ar: {
    on: 'تشغيل', off: 'إيقاف', enabledHere: 'الحماية تعمل على هذا الموقع', disabledHere: 'الحماية متوقفة على هذا الموقع',
    pausedHere: 'متوقفة مؤقتاً حتى', globalOff: 'Wipe Ad متوقف في كل المواقع', turnOnEverywhere: 'تشغيل',
    blockedPage: 'محجوب في هذه الصفحة', blockedTotal: 'إجمالي المحجوب', cookieBanners: 'نوافذ كوكيز تم رفضها',
    mode: 'وضع الفلترة', modeBasic: 'أساسي', modeStandard: 'قياسي', modeStrict: 'صارم',
    modeBasicHint: 'حجب الشبكة فقط — الأسرع والأقل مشاكل.',
    modeStandardHint: 'الشبكة + إخفاء العناصر + السكربتات. موصى به.',
    modeStrictHint: 'يحجب أيضاً سكربتات وإطارات وخطوط الطرف الثالث على هذا الموقع.',
    picker: 'حجب عنصر', zapper: 'إزالة عنصر', pause: 'إيقاف 30 دقيقة', resume: 'استئناف', dashboard: 'لوحة التحكم', log: 'السجل',
    trackers: 'المتتبعون والأطراف الثالثة في هذه الصفحة', noTrackers: 'لم يُكتشف شيء بعد.',
    cat_a: 'إعلانات', cat_t: 'تتبع', cat_m: 'برمجيات ضارة', cat_n: 'مزعجات', cat_s: 'شبكات اجتماعية', cat_o: 'أخرى',
    blocked: 'محجوب', allowed: 'مسموح',
    updateAvailable: 'يتوفر تحديث', getUpdate: 'تحميل التحديث', notWebPage: 'يعمل Wipe Ad على صفحات الويب (http/https).',
    navOverview: 'نظرة عامة', navLists: 'قوائم الفلاتر', navMyFilters: 'فلاتري', navSites: 'المواقع', navPrivacy: 'الخصوصية',
    navLearning: 'تعلّم المتتبعين', navLog: 'سجل الفلترة', navUpdates: 'التحديثات', navSettings: 'الإعدادات', navAbout: 'حول',
    welcomeTitle: 'أهلاً بك في Wipe Ad 👋', welcomeBody: 'أنت محمي الآن. الإعلانات والمتتبعون والمواقع الضارة ونوافذ الكوكيز محجوبة تلقائياً. تصفح الأقسام للتخصيص.',
    statBlocked: 'طلبات محجوبة', statAds: 'إعلانات', statTrackers: 'متتبعون', statMalware: 'برمجيات ضارة', statBanners: 'نوافذ كوكيز', statSince: 'منذ',
    resetStats: 'تصفير الإحصائيات', masterSwitch: 'حماية Wipe Ad', masterHint: 'تشغيل أو إيقاف كل الفلترة في كل المواقع.',
    group_ads: 'الإعلانات', group_privacy: 'الخصوصية', group_malware: 'البرمجيات الضارة والتصيد', group_annoyances: 'المزعجات', group_regions: 'قوائم إقليمية',
    rules: 'قاعدة', cosmeticRules: 'تجميلية', listHome: 'الصفحة الرئيسية', customLists: 'اشتراكات مخصصة', addList: 'إضافة',
    customListPlaceholder: 'https://example.com/filters.txt', removeList: 'حذف', ruleBudget: 'استهلاك القواعد',
    myFiltersHint: 'فلتر واحد في كل سطر. يدعم صيغة Adblock Plus / uBlock Origin / AdGuard مثل: ||ads.example.com^ و example.com##.banner و example.com##+js(set-constant, foo, false)',
    save: 'حفظ', saved: 'تم الحفظ', test: 'فحص الصيغة', accepted: 'مقبول', unsupported: 'غير مدعوم',
    allowlist: 'المواقع المستثناة', allowlistHint: 'نطاق واحد في كل سطر. لن يعمل Wipe Ad على هذه المواقع.',
    siteModes: 'أوضاع المواقع', noSiteModes: 'لا توجد أوضاع مخصصة. غيّرها من النافذة المنبثقة في شريط الأدوات.',
    privacyStealth: 'وضع التخفي', gpc: 'إرسال إشارات "عدم البيع / عدم التتبع" (GPC + DNT)',
    removeXClientData: 'إزالة ترويسة X-Client-Data التي يرسلها Chrome إلى Google',
    hideReferrer: 'إخفاء مصدر الإحالة (Referrer) عن الأطراف الثالثة', hideSearchQueries: 'إخفاء كلمات بحثك عن المواقع التي تزورها',
    stripTrackingParams: 'إزالة معاملات التتبع من الروابط (utm_* و fbclid و gclid…)', blockPings: 'حجب نبضات تدقيق الروابط (ping)',
    stripThirdPartyCookies: 'حذف كل كوكيز الطرف الثالث (قد يعطل تسجيل الدخول في بعض المواقع)',
    autoDeleteTrackerCookies: 'تدمير كوكيز المتتبعين تلقائياً (كل 15 دقيقة)', cleanNow: 'نظّف الآن', cookiesRemoved: 'كوكيز تم حذفها',
    blockWebRTC: 'منع WebRTC من تسريب عنوان IP الحقيقي', needsPermission: 'يحتاج إذناً إضافياً',
    autoConsent: 'رفض نوافذ موافقة الكوكيز تلقائياً', malwareWarning: 'عرض صفحة تحذير للمواقع الضارة والتصيد',
    cosmetic: 'إخفاء أماكن الإعلانات والفوضى في الصفحة (إخفاء العناصر)', scriptlets: 'تعطيل سكربتات الإعلانات ومكافحة حاجب الإعلانات',
    learningOn: 'تعلّم المتتبعين الجدد تلقائياً', learningHint: 'مثل Privacy Badger: أي طرف ثالث يتتبعك بالكوكيز عبر عدة مواقع يُحجب تلقائياً.',
    threshold: 'الحجب بعد رصده على', sites: 'مواقع', domain: 'النطاق', seenOn: 'رُصد على', status: 'الحالة', action: 'اختيارك',
    actDefault: 'تلقائي', actBlock: 'حجب', actCookieblock: 'حجب الكوكيز', actAllow: 'سماح', resetLearning: 'مسح كل ما تم تعلمه',
    learnEmpty: 'لم يتم تعلم شيء بعد. تصفح بشكل طبيعي — Wipe Ad يراقب المتتبعين.',
    tab: 'التبويب', allTabs: 'كل التبويبات', clear: 'مسح', pauseLog: 'إيقاف مؤقت', time: 'الوقت', type: 'النوع', url: 'الرابط', category: 'التصنيف',
    filterPlaceholder: 'تصفية…', st_blocked: 'محجوب', st_allowed: 'مسموح', st_redirected: 'مُعاد توجيهه', st_cleaned: 'تم تنظيفه',
    currentVersion: 'الإصدار المثبت', latestVersion: 'أحدث إصدار', lastCheck: 'آخر فحص', never: 'أبداً',
    checkNow: 'افحص التحديثات الآن', checking: 'جارٍ الفحص…', upToDate: 'لديك أحدث إصدار ✓', autoUpdateExtension: 'تحديث Wipe Ad تلقائياً',
    autoUpdateFilters: 'تحديث قواعد الفلترة تلقائياً (بدون إعادة تثبيت)', updateInterval: 'الفحص كل',
    hours: 'ساعات', remoteRules: 'تحديثات القواعد الحية', rulesVersion: 'إصدار القواعد', notApplied: 'لم تُحمّل بعد',
    language: 'اللغة', langAuto: 'تلقائي', showBadge: 'عرض عدد المحجوب على أيقونة الإضافة',
    backup: 'النسخ الاحتياطي والاستعادة', exportBtn: 'تصدير الإعدادات', importBtn: 'استيراد الإعدادات', imported: 'تم الاستيراد ✓',
    shortcuts: 'اختصارات لوحة المفاتيح', aboutBody: 'يجمع Wipe Ad أفضل أفكار uBlock Origin و AdGuard و Privacy Badger و Ghostery في إضافة واحدة خفيفة بنظام Manifest V3. قوائم الفلاتر يحافظ عليها مؤلفوها.',
    credits: 'قوائم الفلاتر المستخدمة', confirmSubscribe: 'هل تريد الاشتراك في قائمة الفلاتر هذه؟', subscribe: 'اشتراك', cancel: 'إلغاء',
    navDiagnostics: 'التشخيص', diagHint: 'الأخطاء والعمليات البطيئة وحالات الحجب الزائد المحتملة التي رصدها Wipe Ad. صدّر هذا الملف عند الإبلاغ عن مشكلة.',
    navReport: 'التقرير الأسبوعي', navFocus: 'التركيز والعائلة', fpDetected: 'محاولات أخذ بصمة المتصفح في هذه الصفحة', fpProtected: 'تم تشويشها', fpDetectedOnly: 'تم رصدها',
    api_canvas: 'Canvas', api_webgl: 'WebGL', api_audio: 'الصوت', api_fonts: 'الخطوط',
    siteBroken: 'الموقع لا يعمل؟', brokenBasic: 'التحويل للوضع الأساسي', brokenOff: 'إيقاف على هذا الموقع', brokenReport: 'إبلاغ المطورين',
    secAnnoyances: 'المزعجات', secAdvanced: 'حماية متقدمة',
    skipRedirects: 'تخطي روابط التتبع الوسيطة (روابط فيسبوك وجوجل ويوتيوب تذهب للموقع مباشرة)',
    fpDetect: 'رصد سكربتات أخذ بصمة المتصفح', antiFingerprint: 'تشويش بصمة متصفحي (Canvas و WebGL والصوت)',
    blockNotificationPrompts: 'حجب طلبات "السماح بالإشعارات؟"', stopAutoplay: 'إيقاف التشغيل التلقائي للفيديو',
    hideNewsletters: 'إخفاء نوافذ الاشتراك في النشرات وأدوات الدردشة والفوضى الأخرى', serpBadges: 'عرض تحذيرات وعدد المتتبعين بجانب نتائج البحث',
    weeklyReport: 'إشعار تقرير الخصوصية الأسبوعي',
    cnameUncloak: 'كشف المتتبعين المختبئين خلف نطاقات فرعية للموقع نفسه (CNAME)',
    cnameHint: 'في Chrome و Edge تُفحص أسماء النطاقات الفرعية عبر خدمة DNS-over-HTTPS من Cloudflare.', cnameFound: 'متتبع مخفي تم كشفه',
    reportTitle: 'خصوصيتك هذا الأسبوع', vsLastWeek: 'مقارنة بالأسبوع الماضي', savedData: 'البيانات الموفّرة (تقديري)', savedTime: 'وقت التحميل الموفّر (تقديري)',
    topBlocked: 'أكثر المتتبعين حجباً', worstSites: 'أكثر المواقع احتواءً على متتبعين', mb: 'ميجابايت', minutes: 'دقيقة', seconds: 'ثانية',
    statFingerprinting: 'محاولات أخذ البصمة', statSkipped: 'روابط تتبع تم تخطيها', noData: 'لا توجد بيانات كافية بعد — عد بعد أيام.',
    focusMode: 'وضع التركيز', focusHint: 'حجب المواقع المشتتة خلال ساعات عملك.', focusSites: 'المواقع المشتتة (موقع في كل سطر)',
    focusDays: 'الأيام', focusFrom: 'من', focusTo: 'إلى', focusAllDay: 'طوال اليوم', focusActiveNow: 'وضع التركيز يعمل الآن',
    safeMode: 'وضع الأمان العائلي', safeModeHint: 'يحجب مواقع البالغين ويفرض البحث الآمن في جوجل وبينج وداك داك جو ويوتيوب.',
    syncTitle: 'المزامنة بين الأجهزة', syncEnabled: 'مزامنة إعداداتي وفلاتري واختياراتي للمتتبعين مع حساب المتصفح', syncNow: 'زامن الآن', lastSync: 'آخر مزامنة',
    aiTitle: 'مساعد الفلاتر بالذكاء الاصطناعي', aiHint: 'صف ما تريد إخفاءه في منتقي العناصر ("الشريط الجانبي للفيديوهات") وسيكتب Claude الفلتر. يستخدم مفتاح Anthropic API الخاص بك؛ يُرسل هيكل الصفحة فقط (وليس بياناتك أو الكوكيز) إلى Anthropic عند طلبك فقط.',
    aiKey: 'مفتاح Anthropic API', aiKeySaved: 'المفتاح محفوظ على هذا الجهاز فقط', aiUnavailable: 'غير متضمن في هذا الإصدار', getKey: 'الحصول على مفتاح',
    managedBanner: 'بعض الإعدادات تديرها مؤسستك.',
    skipFailed: 'لم يتمكن Wipe Ad من معرفة وجهة رابط التتبع هذا.', continue: 'المتابعة إلى الرابط',
    focusTitle: 'وقت التركيز', focusBody: 'هذا الموقع محجوب خلال ساعات التركيز.', focusUntil: 'ينتهي التركيز الساعة', focusSettings: 'إعدادات التركيز',
    dangerTitle: 'تم حجب موقع خطير', dangerBody: 'حجب Wipe Ad هذه الصفحة لأنها مدرجة كموقع ضار أو تصيد أو غير مرغوب.',
    goBack: 'العودة إلى الأمان', proceed: 'المتابعة على أي حال (غير موصى به)', alwaysAllow: 'السماح لهذا الموقع دائماً', blockedUrl: 'العنوان المحجوب',
  },
};

let lang = 'en';
export function t(key) { return STRINGS[lang][key] ?? STRINGS.en[key] ?? key; }

export async function initI18n() {
  let pref = 'auto';
  try { const { settings } = await chrome.storage.local.get('settings'); pref = settings?.language || 'auto'; } catch { /* ignore */ }
  const ui = (chrome.i18n?.getUILanguage?.() || navigator.language || 'en').toLowerCase();
  lang = pref === 'auto' ? (ui.startsWith('ar') ? 'ar' : 'en') : pref;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  applyI18n(document);
  return lang;
}

export function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
}

export const send = (msg) => chrome.runtime.sendMessage(msg);
export function fmtNum(n) { return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n || 0); }
export function fmtDate(ts) { return ts ? new Date(ts).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US') : t('never'); }
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c.nodeType ? c : String(c));
  return e;
}
