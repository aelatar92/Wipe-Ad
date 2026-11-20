// Wipe Ad — global configuration shared by the extension and the build tools.
// Change UPDATE_BASE to wherever you host the `updates/` folder (GitHub raw by default).

export const CONFIG = {
  // Remote folder that holds version.json and filters/manifest.json
  UPDATE_BASE: 'https://raw.githubusercontent.com/aelatar92/Wipe-Ad/main/updates',
  RELEASES_URL: 'https://github.com/aelatar92/Wipe-Ad/releases/latest',
  ISSUES_URL: 'https://github.com/aelatar92/Wipe-Ad/issues/new',
  // How often the extension checks for new versions (minutes); rules are checked hourly
  UPDATE_INTERVAL_MIN: 360,
  FILTER_INTERVAL_MIN: 60,
  // AI filter assistant (Anthropic API). Disabled: the SDK is not bundled, the UI is hidden
  // and no request can be made. Set to true and rebuild to bring it back.
  AI_ENABLED: false,
  AI_MODEL: 'claude-opus-5-5',
  // Privacy-Badger-style learning
  TRACKING_THRESHOLD: 3,
  MAX_COOKIE_ENTROPY: 12,
  // Per-tab log size
  LOG_LIMIT: 1000,
};

// Dynamic rule ID ranges (declarativeNetRequest)
export const RULE_IDS = {
  STEALTH_START: 1, STEALTH_END: 99,
  LEARN_START: 100, LEARN_END: 199,
  SITES_START: 200, SITES_END: 499,
  SKIP_START: 500, SKIP_END: 549,       // tracking-redirect skipping
  FOCUS_START: 550, FOCUS_END: 599,     // focus mode
  SAFE_START: 600, SAFE_END: 649,       // family safe mode
  CNAME_START: 650, CNAME_END: 699,     // CNAME-cloaked trackers
  USER_START: 1000, USER_END: 19999,
  REMOTE_START: 20000, REMOTE_END: 49999,
};

// Session rule IDs (temporary — pause / proceed-anyway)
export const SESSION_IDS = { PAUSE: 1, PROCEED_START: 100 };

export const PRIORITY = {
  BLOCK: 10, REDIRECT: 11, REMOVEPARAM: 12, HEADERS: 5,
  ALLOW: 20, IMPORTANT: 30, IMPORTANT_ALLOW: 40,
  LEARN_BLOCK: 9, USER_ALLOW_LEARN: 25, STRICT: 8,
  SITE_ALLOW: 1000000,
};
