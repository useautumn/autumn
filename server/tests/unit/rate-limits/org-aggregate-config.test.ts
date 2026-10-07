import { describe, expect, test } from "bun:test";
import {
	getRateLimitRouteGroup,
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

describe("org rate limits", () => {
	test("high-volume per-customer buckets name their org cap", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.Track].orgLimit).toBe(
			RateLimitType.TrackOrg,
		);
		expect(RATE_LIMIT_CONFIGS[RateLimitType.CheckCustomerGet].orgLimit).toBe(
			RateLimitType.CheckCustomerGetOrg,
		);
		expect(RATE_LIMIT_CONFIGS[RateLimitType.CustomerEntitiesGet].orgLimit).toBe(
			RateLimitType.CustomerEntitiesGetOrg,
		);
	});

	test("buckets without an org cap have none", () => {
		expect(RATE_LIMIT_CONFIGS[RateLimitType.General].orgLimit).toBeUndefined();
		expect(RATE_LIMIT_CONFIGS[RateLimitType.Attach].orgLimit).toBeUndefined();
		expect(RATE_LIMIT_CONFIGS[RateLimitType.TrackOrg].orgLimit).toBeUndefined();
	});

	test("track and check count per customer in memory, per org in Redis", () => {
		for (const type of [RateLimitType.Track, RateLimitType.CheckCustomerGet]) {
			expect(RATE_LIMIT_CONFIGS[type]).toMatchObject({
				scope: RateLimitScope.Customer,
				store: "memory",
				windowMs: 1000,
			});
		}
		const orgCaps = [
			RateLimitType.TrackOrg,
			RateLimitType.CheckCustomerGetOrg,
			RateLimitType.CustomerEntitiesGetOrg,
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

	test("check and track degrade at their org cap, customer reads and entities.get reject", () => {
		const groupFor = ({ method, path }: { method: string; path: string }) =>
			getRateLimitRouteGroup({
				req: { method, path },
				get: () => undefined,
			} as never);

		expect(groupFor({ method: "POST", path: "/v1/check" })).toEqual({
			type: RateLimitType.CheckCustomerGet,
			overLimit: "degrade",
		});
		expect(groupFor({ method: "POST", path: "/v1/track" })).toEqual({
			type: RateLimitType.Track,
			overLimit: "degrade",
		});
		expect(groupFor({ method: "GET", path: "/v1/customers/cus_1" })).toEqual({
			type: RateLimitType.CheckCustomerGet,
			overLimit: undefined,
		});
		expect(groupFor({ method: "POST", path: "/v1/entities.get" })).toEqual({
			type: RateLimitType.CustomerEntitiesGet,
			overLimit: undefined,
		});
	});

	test("enum renames keep the counter keys and override names byte-identical", () => {
		expect(RateLimitType.CheckCustomerGet).toBe("check" as RateLimitType);
		expect(RateLimitType.CheckCustomerGetOrg).toBe(
			"check_org" as RateLimitType,
		);
		expect(RateLimitType.CustomerEntitiesGetOrg).toBe(
			"entities_get_org" as RateLimitType,
		);
	});
});
