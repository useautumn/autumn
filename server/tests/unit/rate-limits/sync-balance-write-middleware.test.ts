import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	RATE_LIMIT_CONFIGS,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const limiterCalls: RateLimitType[] = [];
const recordingLimiter =
	(type: RateLimitType) => async (_c: unknown, next: () => Promise<void>) => {
		limiterCalls.push(type);
		await next();
	};

await mockModuleWithRestore(
	"@/internal/misc/rateLimiter/rateLimitFactory",
	() => ({
		getLimiterForType: (type: RateLimitType) => recordingLimiter(type),
		getOrgLimiterFor: ({ type }: { type: RateLimitType }) => {
			const orgLimit = RATE_LIMIT_CONFIGS[type].orgLimit;
			return (
				orgLimit && { type: orgLimit, limiter: recordingLimiter(orgLimit) }
			);
		},
		getRateLimitKey: ({ rateLimitType }: { rateLimitType: RateLimitType }) =>
			`key:${rateLimitType}`,
		setRateLimitKeyInContext: () => undefined,
	}),
);

const { rateLimitMiddleware } = await import(
	"@/honoMiddlewares/rateLimitMiddleware.js"
);

const request = async ({
	path,
	body,
}: {
	path: string;
	body: Record<string, unknown>;
}) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			env: "live",
			org: { id: "org_123", slug: "test-org" },
			customerId: "cus_123",
			apiVersion: new ApiVersionClass(ApiVersion.V2_5),
			requestBody: body,
			features: [],
			logger: { error: () => undefined },
		} as never);
		return rateLimitMiddleware(c, next);
	});
	app.post(path, (c) => c.json({ success: true }));
	return app.request(path, { method: "POST", body: JSON.stringify(body) });
};

describe("synchronous balance write limiters", () => {
	beforeEach(() => {
		limiterCalls.length = 0;
	});

	test("a sync track runs only SyncBalanceWriteOrg then SyncBalanceWrite", async () => {
		const response = await request({
			path: "/v1/balances.track",
			body: { customer_id: "cus_123", feature_id: "messages", async: false },
		});

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([
			RateLimitType.SyncBalanceWriteOrg,
			RateLimitType.SyncBalanceWrite,
		]);
	});

	test("a lock check runs only SyncBalanceWriteOrg then SyncBalanceWrite", async () => {
		const response = await request({
			path: "/v1/balances.check",
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				lock: { enabled: true, lock_id: "lock_1" },
			},
		});

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([
			RateLimitType.SyncBalanceWriteOrg,
			RateLimitType.SyncBalanceWrite,
		]);
	});
});

afterAll(() => {
	mock.restore();
});
