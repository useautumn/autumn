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
	apiVersion = ApiVersion.V2_5,
}: {
	path: string;
	body: Record<string, unknown>;
	apiVersion?: ApiVersion;
}) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", {
			env: "live",
			org: { id: "org_123", slug: "test-org" },
			// baseMiddleware resolves the customer from the body's customer_id.
			customerId: body.customer_id,
			apiVersion: new ApiVersionClass(apiVersion),
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

	test("a finalize with customer_id runs SyncBalanceWriteOrg then SyncBalanceWrite", async () => {
		const response = await request({
			path: "/v1/balances.finalize",
			apiVersion: ApiVersion.V2_6,
			body: { customer_id: "cus_123", lock_id: "lock_1", action: "confirm" },
		});

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([
			RateLimitType.SyncBalanceWriteOrg,
			RateLimitType.SyncBalanceWrite,
		]);
	});

	test("a finalize without customer_id runs only SyncBalanceWriteOrg", async () => {
		const response = await request({
			path: "/v1/balances.finalize",
			body: { lock_id: "lock_1", action: "confirm" },
		});

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([RateLimitType.SyncBalanceWriteOrg]);
	});

	test("a queued track still runs TrackOrg then Track", async () => {
		const response = await request({
			path: "/v1/balances.track",
			body: { customer_id: "cus_123", feature_id: "messages", async: true },
		});

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([RateLimitType.TrackOrg, RateLimitType.Track]);
	});

	test("a queued track without a customer still runs TrackOrg then Track", async () => {
		const response = await request({
			path: "/v1/balances.track",
			body: { feature_id: "messages", async: true },
		});

		expect(response.status).toBe(200);
		expect(limiterCalls).toEqual([RateLimitType.TrackOrg, RateLimitType.Track]);
	});
});

afterAll(() => {
	mock.restore();
});
