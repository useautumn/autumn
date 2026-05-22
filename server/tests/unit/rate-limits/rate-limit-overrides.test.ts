import { afterEach, describe, expect, test } from "bun:test";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import {
	_setRateLimitOverridesConfigForTesting,
	getOrgRateLimitOverride,
} from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

const reset = () => {
	_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
};

describe("getOrgRateLimitOverride", () => {
	afterEach(reset);

	test("returns undefined when no override is configured", () => {
		reset();
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: RateLimitType.CustomerEntitiesGet,
			}),
		).toBeUndefined();
	});

	test("returns the override when matched by orgId", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { [RateLimitType.CustomerEntitiesGet]: 500 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: RateLimitType.CustomerEntitiesGet,
			}),
		).toBe(500);
	});

	test("falls back to orgSlug when orgId has no entry", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					mintlify: { limits: { [RateLimitType.CustomerEntitiesGet]: 200 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_unknown",
				orgSlug: "mintlify",
				type: RateLimitType.CustomerEntitiesGet,
			}),
		).toBe(200);
	});

	test("orgId match wins over orgSlug match", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { [RateLimitType.CustomerEntitiesGet]: 999 } },
					mintlify: { limits: { [RateLimitType.CustomerEntitiesGet]: 1 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				orgSlug: "mintlify",
				type: RateLimitType.CustomerEntitiesGet,
			}),
		).toBe(999);
	});

	test("overrides are scoped per RateLimitType — other types fall through", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { [RateLimitType.CustomerEntitiesGet]: 500 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: RateLimitType.Check,
			}),
		).toBeUndefined();
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: RateLimitType.Track,
			}),
		).toBeUndefined();
	});

	test("returns undefined when neither orgId nor orgSlug is supplied", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { [RateLimitType.CustomerEntitiesGet]: 500 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({ type: RateLimitType.CustomerEntitiesGet }),
		).toBeUndefined();
	});

	test("supports overriding a value to 0 (effectively block)", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { [RateLimitType.CustomerEntitiesGet]: 0 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: RateLimitType.CustomerEntitiesGet,
			}),
		).toBe(0);
	});
});
