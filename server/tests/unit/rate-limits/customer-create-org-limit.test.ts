import { afterEach, describe, expect, mock, test } from "bun:test";

const counts = new Map<string, number>();
mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: { warn: () => {}, error: () => {}, info: () => {} },
}));
mock.module("@/external/redis/initRedis.js", () => ({
	shouldUseRedis: () => true,
	getMiscRedis: () => ({
		incr: async (key: string) => {
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			return next;
		},
		pexpire: async () => 1,
	}),
}));

const { assertCustomerCreateWithinOrgLimit } = await import(
	"@/internal/misc/rateLimiter/assertCustomerCreateWithinOrgLimit.js"
);
const { _setRateLimitOverridesConfigForTesting } = await import(
	"@/internal/misc/rateLimiter/rateLimitOverridesStore.js"
);

const ctx = {
	org: { id: "org_1", slug: "acme" },
	env: "live",
} as unknown as Parameters<typeof assertCustomerCreateWithinOrgLimit>[0]["ctx"];

afterEach(() => {
	counts.clear();
	_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
});

describe("assertCustomerCreateWithinOrgLimit", () => {
	test("allows creations up to the org override, then answers 429", async () => {
		_setRateLimitOverridesConfigForTesting({
			config: { orgs: { acme: { limits: { customer_create_org: 2 } } } },
		});
		await assertCustomerCreateWithinOrgLimit({ ctx });
		await assertCustomerCreateWithinOrgLimit({ ctx });
		await expect(
			assertCustomerCreateWithinOrgLimit({ ctx }),
		).rejects.toMatchObject({
			statusCode: 429,
			code: "rate_limit_exceeded",
		});
	});

	test("without an override the default cap leaves normal creation alone", async () => {
		for (let i = 0; i < 50; i++)
			await assertCustomerCreateWithinOrgLimit({ ctx });
	});
});
