import crypto from 'node:crypto';
import { queryOne, queryAll, execute } from '../db/index.js';
import { parseAcceptanceCriteria } from '../verification/evidenceMatcher.js';

export const PROMPT_TEMPLATE_VERSION = '1.0.0';

/**
 * Checks if the AI result cache is enabled.
 * Default is true unless explicitly disabled via AI_CACHE_ENABLED='false'.
 */
export function isAiCacheEnabled() {
  const envVal = (process.env.AI_CACHE_ENABLED || '').toLowerCase().trim();
  return envVal !== 'false' && envVal !== '0' && envVal !== 'no';
}

/**
 * Gets configured TTL in days (null if unlimited).
 */
export function getAiCacheTtlDays() {
  const val = parseInt(process.env.AI_CACHE_TTL_DAYS, 10);
  return isNaN(val) || val <= 0 ? null : val;
}

/**
 * Normalizes candidate evidence for ID-independent deterministic cache key calculation.
 * Strips raw database IDs and uses only content coordinates:
 * filePath, lines, identifier, and hash of snippet.
 *
 * @param {Array<Object>} candidateEvidence
 * @returns {Array<Object>} Deterministically sorted content descriptors
 */
export function normalizeCandidateEvidenceForCache(candidateEvidence = []) {
  const items = candidateEvidence.map((ev) => {
    const snippet = String(ev.codeSnippet || ev.snippet || '').trim();
    const snippetHash = crypto.createHash('sha256').update(snippet).digest('hex').slice(0, 16);

    return {
      filePath: String(ev.filePath || '').trim().replace(/\\/g, '/'),
      startLine: parseInt(ev.startLine, 10) || 0,
      endLine: parseInt(ev.endLine, 10) || 0,
      identifier: String(ev.identifier || '').trim(),
      evidenceType: String(ev.evidenceType || '').trim(),
      snippetHash,
    };
  });

  // Sort deterministically by filePath, startLine, identifier
  items.sort((a, b) => {
    const pathCmp = a.filePath.localeCompare(b.filePath);
    if (pathCmp !== 0) return pathCmp;
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return a.identifier.localeCompare(b.identifier);
  });

  return items;
}

/**
 * Computes a SHA-256 cache key over requirement, candidate evidence content,
 * model name, prompt version, and purpose.
 *
 * Changing snippet, criteria, model, or prompt version results in a cache miss.
 *
 * @param {Object} params
 * @param {string} [params.purpose='VERIFICATION']
 * @param {string} [params.promptVersion=PROMPT_TEMPLATE_VERSION]
 * @param {string} params.modelName
 * @param {Object} params.requirement
 * @param {Array<Object>} params.candidateEvidence
 * @returns {string} SHA-256 hex string
 */
export function computeVerificationCacheKey({
  purpose = 'VERIFICATION',
  promptVersion = PROMPT_TEMPLATE_VERSION,
  modelName = 'gemini-2.0-flash',
  requirement = {},
  candidateEvidence = [],
} = {}) {
  const criteriaList = parseAcceptanceCriteria(requirement.acceptance_criteria);
  const normalizedCriteria = criteriaList.map((c) => String(c).trim()).filter(Boolean).sort();

  const normalizedPayload = {
    purpose: String(purpose).trim().toUpperCase(),
    promptVersion: String(promptVersion).trim(),
    modelName: String(modelName).trim(),
    requirement: {
      title: String(requirement.title || '').trim(),
      description: String(requirement.description || '').trim(),
      criteria: normalizedCriteria,
      category: String(requirement.category || '').trim().toUpperCase(),
    },
    candidates: normalizeCandidateEvidenceForCache(candidateEvidence),
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizedPayload))
    .digest('hex');
}

/**
 * Retrieves a cached AI result if available and not expired.
 *
 * @param {string} cacheKey
 * @returns {Object|null} Cached result record or null
 */
export function getCachedAiResult(cacheKey) {
  if (!isAiCacheEnabled() || !cacheKey) {
    return null;
  }

  const row = queryOne(
    `SELECT cache_key, purpose, model_name, prompt_version, result_json, created_at, hit_count
     FROM ai_cache
     WHERE cache_key = ?`,
    [cacheKey]
  );

  if (!row) return null;

  // Check TTL if configured
  const ttlDays = getAiCacheTtlDays();
  if (ttlDays) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    const maxAgeMs = ttlDays * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      execute('DELETE FROM ai_cache WHERE cache_key = ?', [cacheKey]);
      return null;
    }
  }

  // Increment hit count asynchronously / synchronously in SQLite
  try {
    execute(
      `UPDATE ai_cache 
       SET hit_count = hit_count + 1, last_hit_at = ? 
       WHERE cache_key = ?`,
      [new Date().toISOString(), cacheKey]
    );
  } catch {}

  let parsed = null;
  try {
    parsed = JSON.parse(row.result_json);
  } catch {
    return null;
  }

  return {
    cacheKey: row.cache_key,
    purpose: row.purpose,
    modelName: row.model_name,
    promptVersion: row.prompt_version,
    result: parsed,
    rawJson: row.result_json,
    createdAt: row.created_at,
    hitCount: row.hit_count + 1,
  };
}

/**
 * Stores a validated, normalized AI result in the cache.
 * STRICT POLICY: Never stores RULES output or error results.
 *
 * @param {Object} params
 * @param {string} params.cacheKey
 * @param {string} [params.purpose='VERIFICATION']
 * @param {string} params.modelName
 * @param {string} [params.promptVersion=PROMPT_TEMPLATE_VERSION]
 * @param {Object|string} params.result - Validated, normalized result
 * @returns {boolean} Whether the result was cached
 */
export function setCachedAiResult({
  cacheKey,
  purpose = 'VERIFICATION',
  modelName,
  promptVersion = PROMPT_TEMPLATE_VERSION,
  result,
}) {
  if (!isAiCacheEnabled() || !cacheKey || !result) {
    return false;
  }

  // POLICY GUARD: Never cache error results or RULES results
  const resObj = typeof result === 'string' ? JSON.parse(result) : result;
  if (!resObj || resObj.isAiError || resObj.method === 'RULES' || resObj.isRulesFallback) {
    return false;
  }

  const jsonStr = typeof result === 'string' ? result : JSON.stringify(result);
  const now = new Date().toISOString();

  try {
    execute(
      `INSERT INTO ai_cache (
        cache_key, purpose, model_name, prompt_version, result_json, created_at, hit_count, last_hit_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
      ON CONFLICT(cache_key) DO UPDATE SET
        result_json = excluded.result_json,
        model_name = excluded.model_name,
        prompt_version = excluded.prompt_version`,
      [cacheKey, purpose, modelName, promptVersion, jsonStr, now]
    );
    return true;
  } catch (err) {
    console.error('Failed to write to ai_cache:', err.message);
    return false;
  }
}

/**
 * Purges expired cache entries based on TTL.
 * @returns {number} Number of purged entries
 */
export function purgeExpiredCacheEntries() {
  const ttlDays = getAiCacheTtlDays();
  if (!ttlDays) return 0;

  const cutoffDate = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const info = execute('DELETE FROM ai_cache WHERE created_at < ?', [cutoffDate]);
  return info?.changes || 0;
}

