import { afterEach, describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { assertCustomerCreateWithinOrgLimit } from "@/internal/misc/rateLimiter/assertCustomerCreateWithinOrgLimit.js";
import { _setRateLimitOverridesConfigForTesting } from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

const createCounter = () => {
	const counts = new Map<string, number>();
	return {
		incrWithExpiry: async (key: string) => {
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			return next;
		},
	};
};

const ctx = {
	org: { id: "org_1", slug: "acme" },
	env: "live",
} as unknown as AutumnContext;

afterEach(() => {
	_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
});

describe("assertCustomerCreateWithinOrgLimit", () => {
	test("allows creations up to the org override, then answers 429", async () => {
		_setRateLimitOverridesConfigForTesting({
			config: { orgs: { acme: { limits: { customer_create_org: 2 } } } },
		});
		const counter = createCounter();
		await assertCustomerCreateWithinOrgLimit({ ctx, counter, now: 0 });
		await assertCustomerCreateWithinOrgLimit({ ctx, counter, now: 0 });
		await expect(
			assertCustomerCreateWithinOrgLimit({ ctx, counter, now: 0 }),
		).rejects.toMatchObject({
			statusCode: 429,
			code: "customer_create_rate_limited",
		});
	});

	test("without an override the default cap leaves normal creation alone", async () => {
		const counter = createCounter();
		for (let i = 0; i < 50; i++)
			await assertCustomerCreateWithinOrgLimit({ ctx, counter, now: 0 });
	});
});
