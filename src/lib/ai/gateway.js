import { GoogleGenAI } from '@google/genai';
import { AI_CONFIG } from './config.js';
import { inspectGeminiError, callWithRetry } from './gemini.js';
import { getCachedAiResult, isAiCacheEnabled } from './cache.js';

export class AiUnavailableError extends Error {
  constructor(reason, message, originalError = null, statusCode = null) {
    super(message || `AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
    this.reason = reason; // BREAKER_OPEN | RATE_LIMIT | OVERLOADED | TIMEOUT | AUTH | NOT_CONFIGURED | KILL_SWITCH
    this.originalError = originalError;
    this.statusCode = statusCode;
  }
}

// Gateway internal singleton state
let defaultClient = null;
let customTransport = null;
let customClock = null;

// Circuit Breaker State: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
let breakerState = 'CLOSED';
let consecutiveFailures = 0;
let lastErrorReason = null;
let nextProbeAt = 0;
let halfOpenInFlight = false;

// Concurrency Semaphore State
let activeRequests = 0;
const waitingQueue = [];

// Token Bucket Rate Limiter State
let availableTokens = AI_CONFIG.rpm;
let lastTokenRefillTime = Date.now();

function getNow() {
  return customClock ? customClock.now() : Date.now();
}

function getSleep() {
  return customClock?.sleep ? customClock.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Allows test suites to inject custom clock and transport mechanisms.
 */
export function configureAiGatewayForTesting({ transport = null, clock = null } = {}) {
  customTransport = transport;
  customClock = clock;
  if (clock) {
    lastTokenRefillTime = clock.now();
  }
}

/**
 * Resets circuit breaker and gateway state (primarily for test isolation).
 */
export function resetAiGatewayState() {
  breakerState = 'CLOSED';
  consecutiveFailures = 0;
  lastErrorReason = null;
  nextProbeAt = 0;
  halfOpenInFlight = false;
  activeRequests = 0;
  waitingQueue.length = 0;
  availableTokens = AI_CONFIG.rpm;
  lastTokenRefillTime = getNow();
  defaultClient = null;
}

/**
 * Acquires a slot from the concurrency semaphore.
 */
async function acquireSemaphore(timeoutMs) {
  const maxConcurrency = AI_CONFIG.maxConcurrency;
  if (activeRequests < maxConcurrency) {
    activeRequests++;
    return () => releaseSemaphore();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waitingQueue.findIndex((item) => item.resolve === resolve);
      if (idx !== -1) {
        waitingQueue.splice(idx, 1);
      }
      reject(new AiUnavailableError('TIMEOUT', `Concurrency queue wait timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    waitingQueue.push({
      resolve: () => {
        clearTimeout(timer);
        resolve(() => releaseSemaphore());
      },
    });
  });
}

function releaseSemaphore() {
  if (waitingQueue.length > 0) {
    const next = waitingQueue.shift();
    next.resolve();
  } else {
    activeRequests = Math.max(0, activeRequests - 1);
  }
}

/**
 * Refills and consumes a token from the rate limiter bucket.
 */
async function consumeRateLimitToken() {
  const now = getNow();
  const rpm = AI_CONFIG.rpm;
  const elapsed = now - lastTokenRefillTime;
  const tokensToAdd = (elapsed * rpm) / 60000;

  availableTokens = Math.min(rpm, availableTokens + tokensToAdd);
  lastTokenRefillTime = now;

  if (availableTokens < 1) {
    const tokensNeeded = 1 - availableTokens;
    const waitTimeMs = Math.ceil((tokensNeeded * 60000) / rpm);
    if (waitTimeMs > 5000) {
      throw new AiUnavailableError('RATE_LIMIT', `Local AI rate limit exceeded (${rpm} RPM). Try again shortly.`);
    }
    const sleep = getSleep();
    await sleep(waitTimeMs);
    availableTokens = Math.min(rpm, availableTokens + (waitTimeMs * rpm) / 60000);
    lastTokenRefillTime = getNow();
  }

  availableTokens = Math.max(0, availableTokens - 1);
}

/**
 * Obtains or lazily creates the official GoogleGenAI client.
 */
export function getAiClient() {
  if (customTransport) return customTransport;
  if (!AI_CONFIG.isConfigured) {
    throw new AiUnavailableError('NOT_CONFIGURED', 'GEMINI_API_KEY is not configured on the server.');
  }
  if (!defaultClient) {
    defaultClient = new GoogleGenAI({ apiKey: AI_CONFIG.apiKey });
  }
  return defaultClient;
}

/**
 * Returns current status of AI services and circuit breaker.
 * @returns {{ mode: 'LIVE' | 'DEGRADED' | 'RULES_ONLY', breakerState: string, consecutiveFailures: number, lastErrorReason: string|null, nextProbeAt: number }}
 */
export function getAiStatus() {
  if (AI_CONFIG.forceRulesMode) {
    return {
      mode: 'RULES_ONLY',
      breakerState: 'OPEN',
      consecutiveFailures,
      lastErrorReason: 'KILL_SWITCH',
      nextProbeAt: 0,
    };
  }

  if (!AI_CONFIG.isConfigured && !customTransport) {
    return {
      mode: 'RULES_ONLY',
      breakerState: 'OPEN',
      consecutiveFailures,
      lastErrorReason: 'NOT_CONFIGURED',
      nextProbeAt: 0,
    };
  }

  if (lastErrorReason === 'AUTH') {
    return {
      mode: 'RULES_ONLY',
      breakerState: 'OPEN',
      consecutiveFailures,
      lastErrorReason: 'AUTH',
      nextProbeAt: 0,
    };
  }

  const now = getNow();
  if (breakerState === 'OPEN') {
    // If cooldown has expired, it can transition to HALF_OPEN on next request
    const isPastCooldown = now >= nextProbeAt;
    return {
      mode: 'DEGRADED',
      breakerState: isPastCooldown ? 'HALF_OPEN_READY' : 'OPEN',
      consecutiveFailures,
      lastErrorReason,
      nextProbeAt,
    };
  }

  if (breakerState === 'HALF_OPEN' || consecutiveFailures > 0) {
    return {
      mode: 'DEGRADED',
      breakerState,
      consecutiveFailures,
      lastErrorReason,
      nextProbeAt,
    };
  }

  return {
    mode: 'LIVE',
    breakerState: 'CLOSED',
    consecutiveFailures: 0,
    lastErrorReason: null,
    nextProbeAt: 0,
  };
}

/**
 * Records an error in the circuit breaker, triggering OPEN when threshold is met.
 */
function recordBreakerFailure(reason, error) {
  lastErrorReason = reason;
  consecutiveFailures++;

  if (consecutiveFailures >= AI_CONFIG.breakerThreshold || breakerState === 'HALF_OPEN') {
    breakerState = 'OPEN';
    const jitter = Math.floor(Math.random() * 5000);
    nextProbeAt = getNow() + AI_CONFIG.breakerCooldownMs + jitter;
    halfOpenInFlight = false;
  }
}

function recordBreakerSuccess() {
  breakerState = 'CLOSED';
  consecutiveFailures = 0;
  lastErrorReason = null;
  nextProbeAt = 0;
  halfOpenInFlight = false;
}

/**
 * Executes a call with an AbortSignal timeout.
 */
async function executeWithTimeout(fn, timeoutMs) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new AiUnavailableError('TIMEOUT', `AI generation call timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The ONLY function that talks to GoogleGenAI or test transport.
 * Enforces:
 * - Kill switch & configuration guards
 * - Circuit breaker check
 * - Concurrency semaphore
 * - Rate limiter bucket
 * - AbortSignal call timeout
 * - Model fallback chaining (on 503, 429, 404)
 * - Automatic transient retries with Retry-After honoring
 *
 * @param {Object} params
 * @param {string} [params.model]
 * @param {Array<Object>} params.contents
 * @param {Object} [params.config]
 * @param {Object} [options]
 * @returns {Promise<string>} Generated text content
 */
export async function executeAiCall({ model, contents, config }, options = {}) {
  // 1. Kill Switch Check
  if (AI_CONFIG.forceRulesMode) {
    throw new AiUnavailableError('KILL_SWITCH', 'AI execution disabled via AI_FORCE_RULES_MODE kill switch.');
  }

  // 1.5 Cache Check in Gateway Layer (costs zero quota / tokens)
  const cacheKey = options.cacheKey;
  if (cacheKey && isAiCacheEnabled()) {
    const cached = getCachedAiResult(cacheKey);
    if (cached) {
      if (options.cacheHitRef && typeof options.cacheHitRef === 'object') {
        options.cacheHitRef.hit = true;
      }
      return cached.rawJson;
    }
  }

  // 2. Configuration Check
  if (!AI_CONFIG.isConfigured && !customTransport) {
    lastErrorReason = 'NOT_CONFIGURED';
    throw new AiUnavailableError('NOT_CONFIGURED', 'GEMINI_API_KEY is not configured on the server.');
  }

  // 3. Circuit Breaker Check
  const now = getNow();
  if (breakerState === 'OPEN') {
    if (now >= nextProbeAt) {
      if (!halfOpenInFlight) {
        breakerState = 'HALF_OPEN';
        halfOpenInFlight = true;
      } else {
        throw new AiUnavailableError('BREAKER_OPEN', 'AI Circuit Breaker is OPEN. Probe probe is already in flight.');
      }
    } else {
      const waitRemaining = Math.max(0, nextProbeAt - now);
      throw new AiUnavailableError(
        'BREAKER_OPEN',
        `AI Circuit Breaker is OPEN. Fast-failing without network call (${waitRemaining}ms cooldown remaining).`
      );
    }
  }

  const timeoutMs = options.timeoutMs || AI_CONFIG.callTimeoutMs;

  // 4. Concurrency Semaphore
  const release = await acquireSemaphore(timeoutMs);

  try {
    // 5. Rate Limiter
    await consumeRateLimitToken();

    // 6. Model Fallback Chain
    const candidateModels = [
      model || AI_CONFIG.defaultModel,
      ...AI_CONFIG.fallbackModels.filter((m) => m !== (model || AI_CONFIG.defaultModel)),
    ];

    let lastError = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const currentModel = candidateModels[i];

      try {
        const text = await executeWithTimeout(async () => {
          return await callWithRetry(
            async (attempt) => {
              if (customTransport) {
                return await customTransport.generateContent({
                  model: currentModel,
                  contents,
                  config,
                  attempt,
                });
              }

              const client = getAiClient();
              const response = await client.models.generateContent({
                model: currentModel,
                contents,
                config,
              });

              return response.text || '';
            },
            {
              ...options,
              sleepFn: getSleep(),
            }
          );
        }, timeoutMs);

        // Success closes the circuit
        recordBreakerSuccess();
        return text;
      } catch (err) {
        lastError = err;
        const inspected = inspectGeminiError(err);

        // Auth errors must NOT retry or fallback to other models; immediate hard fail to RULES_ONLY
        if (inspected.isAuth) {
          lastErrorReason = 'AUTH';
          throw new AiUnavailableError('AUTH', 'Gemini API authentication failed.', err, 401);
        }

        const isModelFallbackEligible =
          inspected.isUnavailable || inspected.isRateLimit || inspected.isNotFound;

        if (isModelFallbackEligible && i < candidateModels.length - 1) {
          const nextModel = candidateModels[i + 1];
          console.warn(`[AI Gateway] Model "${currentModel}" failed (${inspected.statusText || inspected.statusCode}). Falling back to "${nextModel}"...`);
          continue; // Try next model in chain
        }

        // Determine specific typed error reason
        let reason = 'OVERLOADED';
        if (inspected.isRateLimit) reason = 'RATE_LIMIT';
        else if (err.reason === 'TIMEOUT' || inspected.isNetwork) reason = 'TIMEOUT';
        else if (inspected.isUnavailable) reason = 'OVERLOADED';

        recordBreakerFailure(reason, err);

        throw new AiUnavailableError(
          reason,
          `AI service call failed on model ${currentModel}: ${err.message}`,
          err,
          inspected.statusCode
        );
      }
    }

    throw lastError;
  } finally {
    release();
  }
}
