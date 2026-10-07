import { describe, expect, test } from "bun:test";
import {
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

describe("org rate limits", () => {
	test("high-volume per-customer buckets name their org cap", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.Track].orgLimit).toBe(
			RateLimitType.TrackOrg,
		);
		expect(RATE_LIMIT_CONFIGS[RateLimitType.Check].orgLimit).toBe(
			RateLimitType.CheckOrg,
		);
		expect(RATE_LIMIT_CONFIGS[RateLimitType.CustomerEntitiesGet].orgLimit).toBe(
			RateLimitType.EntitiesGetOrg,
		);
	});

	test("buckets without an org cap have none", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.General].orgLimit).toBeUndefined();
		expect(RATE_LIMIT_CONFIGS[RateLimitType.Attach].orgLimit).toBeUndefined();
		expect(RATE_LIMIT_CONFIGS[RateLimitType.TrackOrg].orgLimit).toBeUndefined();
	});

	test("track and check count per customer in memory, per org in Redis", () => {
		for (const type of [RateLimitType.Track, RateLimitType.Check]) {
			expect(RATE_LIMIT_CONFIGS[type]).toMatchObject({
				scope: RateLimitScope.Customer,
				store: "memory",
				windowMs: 1000,
			});
		}
		const orgCaps = [
			RateLimitType.TrackOrg,
			RateLimitType.CheckOrg,
			RateLimitType.EntitiesGetOrg,
		];
		for (const type of orgCaps) {
			expect(RATE_LIMIT_CONFIGS[type]).toMatchObject({
				scope: RateLimitScope.Org,
				store: "redis",
				windowMs: 60_000,
			});
			expect(RATE_LIMIT_CONFIGS[type].limit).toBeGreaterThan(0);
		}
	});

	test("check/track org caps degrade (handler runs) instead of rejecting", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.CheckOrg].overLimit).toBe(
			"degrade",
		);
		expect(RATE_LIMIT_CONFIGS[RateLimitType.TrackOrg].overLimit).toBe(
			"degrade",
		);
		expect(
			RATE_LIMIT_CONFIGS[RateLimitType.EntitiesGetOrg].overLimit,
		).toBeUndefined();
	});
});
