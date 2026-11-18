/**
 * AI Configuration & Environment Settings
 * Single source of truth for Gemini and Rules-Mode fallbacks.
 */

export const AI_CONFIG = {
  get apiKey() {
    return process.env.GEMINI_API_KEY || '';
  },
  get isConfigured() {
    const key = this.apiKey;
    return Boolean(key && key !== 'your_gemini_api_key_here');
  },
  get defaultModel() {
    return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  },
  get fallbackModels() {
    const raw = process.env.GEMINI_FALLBACK_MODELS || '';
    return raw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  },
  get maxConcurrency() {
    const val = parseInt(process.env.AI_MAX_CONCURRENCY, 10);
    return isNaN(val) || val <= 0 ? 2 : val;
  },
  get rpm() {
    const val = parseInt(process.env.AI_RPM, 10);
    return isNaN(val) || val <= 0 ? 10 : val;
  },
  get callTimeoutMs() {
    const val = parseInt(process.env.AI_CALL_TIMEOUT_MS, 10);
    return isNaN(val) || val <= 0 ? 45000 : val;
  },
  get breakerThreshold() {
    const val = parseInt(process.env.AI_BREAKER_THRESHOLD, 10);
    return isNaN(val) || val <= 0 ? 5 : val;
  },
  get breakerCooldownMs() {
    const val = parseInt(process.env.AI_BREAKER_COOLDOWN_MS, 10);
    return isNaN(val) || val <= 0 ? 60000 : val;
  },
  get forceRulesMode() {
    const raw = (process.env.AI_FORCE_RULES_MODE || '').toLowerCase().trim();
    return raw === 'true' || raw === '1' || raw === 'yes';
  },
};

