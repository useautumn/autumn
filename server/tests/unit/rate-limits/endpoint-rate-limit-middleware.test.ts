import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { _setRateLimitOverridesConfigForTesting } from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const groupLimiterCalls: RateLimitType[] = [];
const counts = new Map<string, number>();

await mockModuleWithRestore(
	"@/internal/misc/rateLimiter/rateLimitFactory",
	() => ({
		getLimiterForType:
			(type: RateLimitType) =>
			async (_c: unknown, next: () => Promise<void>) => {
				groupLimiterCalls.push(type);
				await next();
			},
		getOrgLimiterFor: () => undefined,
		getRateLimitKey: () => "key",
		setRateLimitKeyInContext: () => undefined,
	}),
);
await mockModuleWithRestore("@/external/redis/initRedis", () => ({
	shouldUseRedis: () => true,
}));
await mockModuleWithRestore(
	"@/internal/misc/rateLimiter/fixedWindowCounter",
	() => ({
		incrementFixedWindow: async ({ key }: { key: string }) => {
			counts.set(key, (counts.get(key) ?? 0) + 1);
			return counts.get(key);
		},
	}),
);

const { rateLimitMiddleware } = await import(
	"@/honoMiddlewares/rateLimitMiddleware.js"
);

const request = async ({ orgId, path }: { orgId: string; path: string }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			env: "live",
			org: { id: orgId, slug: orgId },
			logger: { error: () => undefined },
		} as never);
		return rateLimitMiddleware(c, next);
	});
	app.post("/v1/*", (c) => c.json({ success: true }));
	return app.request(path, { method: "POST" });
};

describe("rateLimitMiddleware endpoint overrides", () => {
	beforeEach(() => {
		groupLimiterCalls.length = 0;
		counts.clear();
		_setRateLimitOverridesConfigForTesting({
			config: {
				orgs: {
					org_a: {
						limits: {},
						endpoints: {
							"POST /v1/entities.delete": { limit: 1, windowMs: 1000 },
						},
					},
				},
			},
		});
	});

	test("over the override answers the API's 429 before any group limiter", async () => {
		const first = await request({
			orgId: "org_a",
			path: "/v1/entities.delete",
		});
		expect(first.status).toBe(200);
		expect(groupLimiterCalls).toEqual(["general"] as RateLimitType[]);

		const second = await request({
			orgId: "org_a",
			path: "/v1/entities.delete",
		});
		expect(second.status).toBe(429);
		expect(await second.json()).toMatchObject({ code: "rate_limit_exceeded" });
		expect(groupLimiterCalls).toHaveLength(1);
	});

	test("other orgs and endpoints only meet their group limits", async () => {
		for (let i = 0; i < 3; i++) {
			expect(
				(await request({ orgId: "org_b", path: "/v1/entities.delete" })).status,
			).toBe(200);
			expect(
				(await request({ orgId: "org_a", path: "/v1/entities.create" })).status,
			).toBe(200);
		}
		expect(groupLimiterCalls).toHaveLength(6);
		expect(counts.size).toBe(0);
	});
});

afterAll(() => {
	_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
	mock.restore();
});
