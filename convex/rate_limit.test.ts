import { describe, test, expect } from "vitest";
import { internal } from "./_generated/api";
import { createTestConvex } from "./test.setup";

// Window expiry tests seed the DB directly with an expired record so we
// don't need fake timers (which don't penetrate the edge-runtime sandbox).

const ARGS = {
  key: "test-key",
  limitPerWindow: 3,
  windowMs: 60_000,
};

describe("checkRateLimit", () => {
  test("first request is allowed", async () => {
    const t = createTestConvex();
    const result = await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    expect(result.ok).toBe(true);
  });

  test("requests within the limit are allowed", async () => {
    const t = createTestConvex();
    await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    const result = await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    expect(result.ok).toBe(true);
  });

  test("request exceeding the limit is rejected", async () => {
    const t = createTestConvex();
    await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    const result = await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    expect(result.ok).toBe(false);
    expect("retryAfterMs" in result && result.retryAfterMs).toBeGreaterThan(0);
  });

  test("different keys have independent counters", async () => {
    const t = createTestConvex();
    const argsA = { ...ARGS, key: "key-a" };
    const argsB = { ...ARGS, key: "key-b" };

    await t.mutation(internal.rate_limit.checkRateLimit, argsA);
    await t.mutation(internal.rate_limit.checkRateLimit, argsA);
    await t.mutation(internal.rate_limit.checkRateLimit, argsA);
    // key-a is now exhausted
    const resultA = await t.mutation(internal.rate_limit.checkRateLimit, argsA);
    expect(resultA.ok).toBe(false);

    // key-b should still be allowed
    const resultB = await t.mutation(internal.rate_limit.checkRateLimit, argsB);
    expect(resultB.ok).toBe(true);
  });

  test("window expiry allows requests again", async () => {
    const t = createTestConvex();
    // Seed an expired record already at the limit
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimits", {
        key: ARGS.key,
        windowStart: Date.now() - ARGS.windowMs - 1,
        count: ARGS.limitPerWindow,
      });
    });
    const result = await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    expect(result.ok).toBe(true);
  });

  test("counter resets to 1 after window expiry", async () => {
    const t = createTestConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimits", {
        key: ARGS.key,
        windowStart: Date.now() - ARGS.windowMs - 1,
        count: ARGS.limitPerWindow,
      });
    });
    // 3 more requests should all pass (new window, limit = 3)
    for (let i = 0; i < ARGS.limitPerWindow; i++) {
      const r = await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
      expect(r.ok).toBe(true);
    }
    // 4th should be rejected
    const over = await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    expect(over.ok).toBe(false);
  });

  test("retryAfterMs is positive and at most windowMs when limited", async () => {
    const t = createTestConvex();
    for (let i = 0; i < ARGS.limitPerWindow; i++) {
      await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    }
    const result = await t.mutation(internal.rate_limit.checkRateLimit, ARGS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(ARGS.windowMs);
    }
  });
});
