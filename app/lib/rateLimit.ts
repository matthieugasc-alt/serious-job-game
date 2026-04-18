/**
 * rateLimit.ts — In-memory sliding window rate limiter
 *
 * No external deps, no Redis. Stores timestamps per key in a Map.
 * Automatically prunes expired entries on each check.
 *
 * Usage:
 *   const limit = checkRateLimit(userId ?? ip, 'chat', { max: 20, windowMs: 60_000 });
 *   if (limit.blocked) return Response.json(limit.body, { status: 429 });
 */

// ─── Storage ──────────────────────────────────────────────────

const store = new Map<string, number[]>();

// Prune all keys every 5 minutes to prevent memory growth
const PRUNE_INTERVAL = 5 * 60_000;
let lastPrune = Date.now();

function pruneAll(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL) return;
  lastPrune = now;
  store.forEach((timestamps, key) => {
    const cutoff = now - 120_000; // keep 2 min max window entries
    const fresh = timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      store.set(key, fresh);
    }
  });
}

// ─── Rate Limit Config ─────────────────────────────────────────

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
}

/** Pre-configured limits for each route category.
 *  Chat & TTS budgets account for NPC auto-messages (each player message
 *  can trigger 2-3 additional AI/TTS calls for NPC characters). */
export const RATE_LIMITS = {
  chat:                 { max: 40, windowMs: 60_000 } as RateLimitConfig,
  debrief:              { max: 5,  windowMs: 60_000 } as RateLimitConfig,
  evaluate_presentation:{ max: 15, windowMs: 60_000 } as RateLimitConfig,
  tts:                  { max: 30, windowMs: 60_000 } as RateLimitConfig,
  transcribe:           { max: 20, windowMs: 60_000 } as RateLimitConfig,
  auth:                 { max: 10, windowMs: 60_000 } as RateLimitConfig,
  admin_write:          { max: 10, windowMs: 60_000 } as RateLimitConfig,
};

// ─── Check Function ────────────────────────────────────────────

export interface RateLimitResult {
  blocked: boolean;
  remaining: number;
  body: { error: string; message: string; retryAfterMs?: number };
}

/**
 * Check rate limit for a given identity + route.
 *
 * @param identifier  userId (from auth) or IP address (fallback)
 * @param route       route key (used as namespace in the store)
 * @param config      { max, windowMs }
 */
export function checkRateLimit(
  identifier: string,
  route: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  pruneAll(now);

  const key = `${route}:${identifier}`;
  const timestamps = store.get(key) || [];
  const cutoff = now - config.windowMs;

  // Keep only timestamps within the window
  const recent = timestamps.filter((t) => t > cutoff);

  if (recent.length >= config.max) {
    // Blocked — compute retry delay
    const oldestInWindow = recent[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;

    store.set(key, recent);
    return {
      blocked: true,
      remaining: 0,
      body: {
        error: "rate_limit_exceeded",
        message: "Trop de requêtes, veuillez patienter quelques secondes.",
        retryAfterMs: Math.max(0, retryAfterMs),
      },
    };
  }

  // Allowed — record this request
  recent.push(now);
  store.set(key, recent);

  return {
    blocked: false,
    remaining: config.max - recent.length,
    body: { error: "", message: "" },
  };
}

// ─── Helper: extract identifier from request ──────────────────

/**
 * Get a rate-limit identifier from an authenticated request.
 * Uses userId if auth succeeded, falls back to IP.
 */
export function getRateLimitId(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;

  // Try common proxy headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0].trim()}`;

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp}`;

  return "ip:unknown";
}
