import assert from "node:assert/strict";
import test from "node:test";

import {
  credentialAttempt,
  getClientAddress,
  getCredentialLimiters,
  rateLimitedResponse,
  SlidingWindowRateLimiter,
} from "./rate-limit";

function createClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance(milliseconds: number) {
      current += milliseconds;
    },
  };
}

test("allows up to the limit inside the window and then blocks", () => {
  const clock = createClock();
  const limiter = new SlidingWindowRateLimiter({
    limit: 3,
    windowMs: 60_000,
    now: clock.now,
  });

  for (let index = 0; index < 3; index += 1) {
    assert.equal(limiter.check("key").allowed, true);
    limiter.record("key");
  }

  const blocked = limiter.check("key");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);

  clock.advance(30_000);
  assert.equal(limiter.check("key").retryAfterSeconds, 30);

  clock.advance(30_001);
  assert.equal(limiter.check("key").allowed, true);
});

test("keys are independent and reset clears a key", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 });
  limiter.record("a");

  assert.equal(limiter.check("a").allowed, false);
  assert.equal(limiter.check("b").allowed, true);

  limiter.reset("a");
  assert.equal(limiter.check("a").allowed, true);
});

test("expired events are pruned and the key count is bounded", () => {
  const clock = createClock();
  const limiter = new SlidingWindowRateLimiter({
    limit: 5,
    windowMs: 1_000,
    maxKeys: 2,
    now: clock.now,
  });

  limiter.record("first");
  limiter.record("second");
  limiter.record("third");
  assert.equal(limiter.size, 2);
  assert.equal(limiter.check("first").allowed, true);

  clock.advance(2_000);
  assert.equal(limiter.check("second").allowed, true);
  assert.equal(limiter.size, 1);
});

test("constructor rejects invalid options", () => {
  assert.throws(
    () => new SlidingWindowRateLimiter({ limit: 0, windowMs: 1 }),
    /limit/,
  );
  assert.throws(
    () => new SlidingWindowRateLimiter({ limit: 1, windowMs: 0 }),
    /windowMs/,
  );
});

test("client address prefers x-real-ip and falls back to x-forwarded-for", () => {
  assert.equal(
    getClientAddress(
      new Request("http://localhost/", {
        headers: {
          "x-real-ip": "203.0.113.9",
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        },
      }),
    ),
    "203.0.113.9",
  );
  assert.equal(
    getClientAddress(
      new Request("http://localhost/", {
        headers: { "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" },
      }),
    ),
    "198.51.100.1",
  );
  assert.equal(getClientAddress(new Request("http://localhost/")), "unknown");
});

test("rate limited responses are 429 with Retry-After", async () => {
  const response = rateLimitedResponse({
    allowed: false,
    retryAfterSeconds: 42,
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "rate_limited");
});

test("credential attempts lock an account after repeated failures", () => {
  const limiters = getCredentialLimiters();
  const request = (address: string) =>
    new Request("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "x-real-ip": address },
    });
  const account = `user-${Date.now()}`;

  for (let index = 0; index < 10; index += 1) {
    const attempt = credentialAttempt(request(`10.1.0.${index}`), account);
    assert.equal(attempt.check().allowed, true);
    attempt.failure();
  }

  // The account bucket is exhausted even from a fresh address and with
  // different casing or whitespace in the username.
  const blocked = credentialAttempt(request("10.9.9.9"), ` ${account.toUpperCase()} `);
  assert.equal(blocked.check().allowed, false);

  // A successful sign-in clears the account bucket but leaves the address
  // counters alone.
  credentialAttempt(request("10.9.9.9"), account).success();
  assert.equal(credentialAttempt(request("10.9.9.8"), account).check().allowed, true);

  limiters.byAccount.reset(`account:${account}`);
  for (let index = 0; index < 10; index += 1) {
    limiters.byAddress.reset(`address:10.1.0.${index}`);
  }
});

test("credential attempts without an account still limit by address", () => {
  const limiters = getCredentialLimiters();
  const address = `10.2.0.${Date.now() % 250}`;
  const request = new Request("http://localhost/api/auth/session", {
    method: "POST",
    headers: { "x-real-ip": address },
  });

  for (let index = 0; index < 30; index += 1) {
    const attempt = credentialAttempt(request, null);
    assert.equal(attempt.check().allowed, true);
    attempt.failure();
  }
  assert.equal(credentialAttempt(request, null).check().allowed, false);
  assert.equal(credentialAttempt(request, "someone").check().allowed, false);

  limiters.byAddress.reset(`address:${address}`);
});
