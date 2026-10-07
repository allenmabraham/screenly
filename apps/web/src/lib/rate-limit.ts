/**
 * In-memory sliding-window limiter for credential endpoints.
 *
 * Each server instance keeps its own counters, so on a horizontally scaled
 * deployment the effective allowance is `limit × instances`. That is still a
 * meaningful brake on online password guessing because scrypt already makes
 * each attempt expensive and the per-username bucket is what protects an
 * individual account; the per-address bucket is a coarse second layer.
 */

export type RateLimitDecision = {
  allowed: boolean;
  /** Seconds the caller should wait before retrying. 0 when allowed. */
  retryAfterSeconds: number;
};

export type RateLimiterOptions = {
  /** Maximum events per key inside the window. */
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys; the oldest key is evicted beyond this. */
  maxKeys?: number;
  now?: () => number;
};

export class SlidingWindowRateLimiter {
  private readonly events = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new Error("limit must be a positive integer.");
    }
    if (!(options.windowMs > 0)) {
      throw new Error("windowMs must be positive.");
    }

    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  /** Reports whether `key` may proceed without recording an event. */
  check(key: string): RateLimitDecision {
    const timestamps = this.prune(key);
    if (timestamps.length < this.limit) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const oldest = timestamps[0]!;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + this.windowMs - this.now()) / 1_000),
      ),
    };
  }

  /** Records one event for `key`, for example a failed sign-in. */
  record(key: string) {
    const timestamps = this.prune(key);
    timestamps.push(this.now());
    this.events.delete(key);
    this.events.set(key, timestamps);
    this.evict();
  }

  /** Clears `key`, for example after a successful sign-in. */
  reset(key: string) {
    this.events.delete(key);
  }

  get size() {
    return this.events.size;
  }

  private prune(key: string) {
    const cutoff = this.now() - this.windowMs;
    const timestamps = (this.events.get(key) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (timestamps.length === 0) {
      this.events.delete(key);
    } else {
      this.events.set(key, timestamps);
    }
    return timestamps;
  }

  private evict() {
    if (this.events.size <= this.maxKeys) {
      return;
    }

    const cutoff = this.now() - this.windowMs;
    for (const [key, timestamps] of this.events) {
      if (timestamps.every((timestamp) => timestamp <= cutoff)) {
        this.events.delete(key);
      }
    }

    // Map iteration follows insertion order, and `record` re-inserts touched
    // keys, so the first entries are the least recently used.
    while (this.events.size > this.maxKeys) {
      const oldestKey = this.events.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.events.delete(oldestKey);
    }
  }
}

/**
 * Best-effort client address for rate limiting. Vercel and most reverse
 * proxies set `x-real-ip`; `x-forwarded-for` is the common fallback. Behind
 * an untrusted proxy the value can be spoofed, which only lets an attacker
 * spread load across buckets, never bypass the per-username limit.
 */
export function getClientAddress(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (forwardedFor) {
    return forwardedFor;
  }

  return "unknown";
}

export function rateLimitedResponse(decision: RateLimitDecision) {
  return Response.json(
    {
      error: {
        code: "rate_limited",
        message: "Too many attempts. Try again later.",
      },
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(decision.retryAfterSeconds),
      },
    },
  );
}

type CredentialLimiters = {
  byAddress: SlidingWindowRateLimiter;
  byAccount: SlidingWindowRateLimiter;
};

const CREDENTIAL_LIMITERS_KEY = Symbol.for("screenly.credentialRateLimiters");
const VIEW_LIMITER_KEY = Symbol.for("screenly.viewRateLimiter");

/**
 * Caps how often one client address can count a view of the same video.
 * The browser already deduplicates per tab session; this stops a script from
 * inflating the public counter with a loop of anonymous requests.
 */
export function getViewLimiter() {
  const globalStore = globalThis as typeof globalThis & {
    [VIEW_LIMITER_KEY]?: SlidingWindowRateLimiter;
  };

  if (!globalStore[VIEW_LIMITER_KEY]) {
    globalStore[VIEW_LIMITER_KEY] = new SlidingWindowRateLimiter({
      limit: 5,
      windowMs: 10 * 60 * 1_000,
      maxKeys: 50_000,
    });
  }

  return globalStore[VIEW_LIMITER_KEY];
}

/**
 * Limiters shared by every credential endpoint (browser sign-in, device
 * sign-in, invitation acceptance). Stored on `globalThis` so development hot
 * reloads do not reset the counters.
 */
export function getCredentialLimiters(): CredentialLimiters {
  const globalStore = globalThis as typeof globalThis & {
    [CREDENTIAL_LIMITERS_KEY]?: CredentialLimiters;
  };

  if (!globalStore[CREDENTIAL_LIMITERS_KEY]) {
    globalStore[CREDENTIAL_LIMITERS_KEY] = {
      byAddress: new SlidingWindowRateLimiter({
        limit: 30,
        windowMs: 10 * 60 * 1_000,
      }),
      byAccount: new SlidingWindowRateLimiter({
        limit: 10,
        windowMs: 15 * 60 * 1_000,
      }),
    };
  }

  return globalStore[CREDENTIAL_LIMITERS_KEY];
}

/**
 * Guards one credential attempt. Call `check` before verifying the secret,
 * `failure` after a rejected attempt and `success` after an accepted one.
 */
export function credentialAttempt(request: Request, account: string | null) {
  const limiters = getCredentialLimiters();
  const addressKey = `address:${getClientAddress(request)}`;
  const accountKey = account ? `account:${account.trim().toLowerCase()}` : null;

  return {
    check(): RateLimitDecision {
      const byAddress = limiters.byAddress.check(addressKey);
      if (!byAddress.allowed) {
        return byAddress;
      }
      if (accountKey) {
        return limiters.byAccount.check(accountKey);
      }
      return byAddress;
    },
    failure() {
      limiters.byAddress.record(addressKey);
      if (accountKey) {
        limiters.byAccount.record(accountKey);
      }
    },
    success() {
      if (accountKey) {
        limiters.byAccount.reset(accountKey);
      }
    },
  };
}
