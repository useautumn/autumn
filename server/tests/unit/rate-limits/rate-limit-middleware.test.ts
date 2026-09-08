import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Red: unscoped entity lists entered the shared `:undefined` customer bucket.
// Green: only customer-scoped lists enter the inner customer limiter.
const limiterCalls: RateLimitType[] = [];

await mockModuleWithRestore(
	"@/internal/misc/rateLimiter/rateLimitFactory",
	() => ({
		getLimiterForType:
			(type: RateLimitType) =>
			async (_c: unknown, next: () => Promise<void>) => {
				limiterCalls.push(type);
				await next();
			},
		getRateLimitKey: ({ rateLimitType }: { rateLimitType: RateLimitType }) =>
			`key:${rateLimitType}`,
		setRateLimitKeyInContext: () => undefined,
	}),
);

const { rateLimitMiddleware } = await import(
	"@/honoMiddlewares/rateLimitMiddleware.js"
);

const requestEntitiesList = async ({ customerId }: { customerId?: string }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			env: "live",
			org: { id: "org_123", slug: "test-org" },
			customerId,
			logger: { error: () => undefined },
		} as never);
		return rateLimitMiddleware(c, next);
	});
	app.post("/v1/entities.list", (c) => c.json({ success: true }));

	return app.request("/v1/entities.list", { method: "POST" });
};

describe("rateLimitMiddleware", () => {
	beforeEach(() => {
		limiterCalls.length = 0;
	});

	test("uses only the org aggregate limiter for an unscoped entities list", async () => {
		const response = await requestEntitiesList({});

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([RateLimitType.ListCustomers]);
	});

	test("uses both limiters for a customer-scoped entities list", async () => {
		const response = await requestEntitiesList({ customerId: "cus_123" });

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([
			RateLimitType.ListCustomers,
			RateLimitType.EntitiesList,
		]);
	});
});

afterAll(() => {
	mock.restore();
});
