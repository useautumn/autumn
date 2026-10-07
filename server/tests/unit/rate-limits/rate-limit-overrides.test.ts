import { afterEach, describe, expect, test } from "bun:test";
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
				type: "customer_entities_get",
			}),
		).toBeUndefined();
	});

	test("returns the override when matched by orgId", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { customer_entities_get: 500 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: "customer_entities_get",
			}),
		).toBe(500);
	});

	test("falls back to orgSlug when orgId has no entry", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					mintlify: { limits: { customer_entities_get: 200 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_unknown",
				orgSlug: "mintlify",
				type: "customer_entities_get",
			}),
		).toBe(200);
	});

	test("orgId match wins over orgSlug match", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { customer_entities_get: 999 } },
					mintlify: { limits: { customer_entities_get: 1 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				orgSlug: "mintlify",
				type: "customer_entities_get",
			}),
		).toBe(999);
	});

	test("overrides are scoped per layer name — other layers fall through", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { customer_entities_get: 500 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: "check",
			}),
		).toBeUndefined();
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: "track",
			}),
		).toBeUndefined();
	});

	test("returns undefined when neither orgId nor orgSlug is supplied", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { customer_entities_get: 500 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({ type: "customer_entities_get" }),
		).toBeUndefined();
	});

	test("supports overriding a value to 0 (effectively block)", () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: { limits: { customer_entities_get: 0 } },
				},
			},
		});
		expect(
			getOrgRateLimitOverride({
				orgId: "org_a",
				type: "customer_entities_get",
			}),
		).toBe(0);
	});
});
