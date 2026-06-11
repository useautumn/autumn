import { describe, expect, test } from "bun:test";
import {
	getOrgAggregateType,
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

describe("org aggregate rate limits", () => {
	test("high-volume per-customer types map to an org aggregate", () => {
		expect(getOrgAggregateType(RateLimitType.Track)).toBe(
			RateLimitType.TrackOrg,
		);
		expect(getOrgAggregateType(RateLimitType.Check)).toBe(
			RateLimitType.CheckOrg,
		);
		expect(getOrgAggregateType(RateLimitType.CustomerEntitiesGet)).toBe(
			RateLimitType.EntitiesGetOrg,
		);
	});

	test("types without an aggregate return undefined", () => {
		expect(getOrgAggregateType(RateLimitType.General)).toBeUndefined();
		expect(getOrgAggregateType(RateLimitType.Attach)).toBeUndefined();
		expect(getOrgAggregateType(RateLimitType.TrackOrg)).toBeUndefined();
	});

	test("aggregate configs are org-scoped, redis-backed, 60s windows", () => {
		const aggregates = [
			RateLimitType.TrackOrg,
			RateLimitType.CheckOrg,
			RateLimitType.EntitiesGetOrg,
		];
		for (const type of aggregates) {
			const config = RATE_LIMIT_CONFIGS[type];
			expect(config.scope).toBe(RateLimitScope.Org);
			expect(config.notInRedis).toBe(false);
			expect(config.windowMs).toBe(60_000);
			expect(config.limit).toBeGreaterThan(0);
		}
	});

	test("check/track aggregates degrade (fail open) instead of rejecting", () => {
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
