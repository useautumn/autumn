import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Customer reads count against check's two counters: the per-customer
// "check" memory bucket (one limiter instance) and the "check_org" Redis key.
// The prod "check" / "check_org" overrides therefore size both; only the
// reads are answered 429 by the limiter itself.
const redisHits = new Map<string, number>();

await mockModuleWithRestore("@/external/redis/initRedis", () => ({
	redis: {},
	shouldUseRedis: () => true,
}));

await mockModuleWithRestore(
	"@/internal/misc/rateLimiter/rateLimitRedisStore",
	() => ({
		createRateLimitRedisStore: () => ({
			increment: async (key: string) => {
				const totalHits = (redisHits.get(key) ?? 0) + 1;
				redisHits.set(key, totalHits);
				return { totalHits, resetTime: new Date(Date.now() + 60_000) };
			},
			decrement: async () => undefined,
			resetKey: async () => undefined,
		}),
	}),
);

const mockLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => mockLogger,
};
await mockModuleWithRestore("@/external/logtail/logtailUtils.js", () => ({
	logger: mockLogger,
}));

import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { _setRateLimitOverridesConfigForTesting } from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

const { rateLimitMiddleware } = await import(
	"@/honoMiddlewares/rateLimitMiddleware.js"
);

const buildApp = ({ orgId }: { orgId: string }) => {
	const app = new Hono<HonoEnv>();
	const degraded: (boolean | undefined)[] = [];
	app.use("*", async (c, next) => {
		c.set("ctx", {
			env: "live",
			org: { id: orgId, slug: orgId },
			customerId: "cus_1",
			logger: mockLogger,
		} as never);
		return rateLimitMiddleware(c, next);
	});
	const handler = (c: {
		get: (key: "ctx") => { orgRateLimitDegraded?: boolean };
	}) => {
		degraded.push(c.get("ctx").orgRateLimitDegraded);
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	};
	app.post("/v1/check", handler);
	app.get("/v1/customers/:customer_id", handler);
	app.post("/v1/customers.get_or_create", handler);
	return {
		check: () => app.request("/v1/check", { method: "POST" }),
		read: () => app.request("/v1/customers/cus_1"),
		getOrCreate: () =>
			app.request("/v1/customers.get_or_create", { method: "POST" }),
		degraded,
	};
};

describe("customer reads share check's counters", () => {
	afterEach(() => {
		redisHits.clear();
		_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
	});

	test("the check_org override caps both; the read rejects, the next check degrades", async () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_shared_org: {
						limits: { [RateLimitType.CheckCustomerGetOrg]: 1 },
					},
				},
			},
		});
		const { check, read, degraded } = buildApp({ orgId: "org_shared_org" });

		expect((await check()).status).toBe(200);
		expect((await read()).status).toBe(429);
		expect((await check()).status).toBe(200);
		expect(degraded).toEqual([undefined, true]);
		expect(redisHits.get("check_org:org_shared_org:live")).toBe(3);
		expect(redisHits.size).toBe(1);
	});

	test("the per-customer check override caps the read too", async () => {
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_shared_customer: {
						limits: { [RateLimitType.CheckCustomerGet]: 1 },
					},
				},
			},
		});
		const { check, read, degraded } = buildApp({
			orgId: "org_shared_customer",
		});

		expect((await check()).status).toBe(200);
		expect((await read()).status).toBe(429);
		expect(degraded).toEqual([undefined]);
	});
});

const separateCaps = (orgId: string) =>
	_setRateLimitOverridesConfigForTesting({
		config: {
			orgs: {
				[orgId]: {
					limits: {
						[RateLimitType.CheckCustomerGetOrg]: 1,
						[RateLimitType.CustomerGetOrCreateOrg]: 1,
					},
				},
			},
		},
	});

describe("customer get-or-create has its own counters", () => {
	afterEach(() => {
		redisHits.clear();
		_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
	});

	test("a check burst does not spend get-or-create's cap", async () => {
		separateCaps("org_check_first");
		const { check, read, getOrCreate, degraded } = buildApp({
			orgId: "org_check_first",
		});

		expect((await check()).status).toBe(200);
		expect((await read()).status).toBe(429);
		expect((await getOrCreate()).status).toBe(200);
		expect((await getOrCreate()).status).toBe(200);
		expect(degraded).toEqual([undefined, undefined, true]);
		expect(
			redisHits.get("customer_get_or_create_org:org_check_first:live"),
		).toBe(2);
	});

	test("a get-or-create burst does not spend check's cap", async () => {
		separateCaps("org_create_first");
		const { check, read, getOrCreate, degraded } = buildApp({
			orgId: "org_create_first",
		});

		expect((await getOrCreate()).status).toBe(200);
		expect((await getOrCreate()).status).toBe(200);
		expect((await check()).status).toBe(200);
		expect((await read()).status).toBe(429);
		expect(degraded).toEqual([undefined, true, undefined]);
		expect(redisHits.get("check_org:org_create_first:live")).toBe(2);
	});
});

afterAll(() => {
	mock.restore();
});
