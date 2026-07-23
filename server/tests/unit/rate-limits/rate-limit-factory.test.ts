import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	shouldUseRedis: false,
	warnings: [] as string[],
};

mock.module("@/external/redis/initRedis", () => ({
	redis: {},
	shouldUseRedis: () => mockState.shouldUseRedis,
}));

// Stub the full `Logger` shape — Bun's `mock.module` is process-wide, so
// later unit tests inherit this stub. Missing methods crash unrelated code.
const mockLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: (message: string) => {
		mockState.warnings.push(message);
	},
	error: () => undefined,
	child: () => mockLogger,
};

mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: mockLogger,
}));

import {
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { rateLimitFactory } from "@/internal/misc/rateLimiter/rateLimitFactory.js";

describe("rateLimitFactory", () => {
	beforeEach(() => {
		mockState.shouldUseRedis = false;
		mockState.warnings = [];
	});

	test("fails open and warns when Redis is unavailable", async () => {
		let nextCalls = 0;
		const middleware = rateLimitFactory({
			type: RateLimitType.General,
			config: {
				name: "test",
				limit: 5,
				windowMs: 1000,
				notInRedis: false,
				scope: RateLimitScope.Org,
			},
		});

		await middleware({} as never, async () => {
			nextCalls++;
		});

		expect(nextCalls).toBe(1);
		expect(mockState.warnings).toEqual([
			"[rate-limit] Redis unavailable; bypassing distributed rate limiting",
		]);
	});

	test("returns 429 without Retry-After for an over-limit establish route", async () => {
		const app = new Hono<HonoEnv>();
		const middleware = rateLimitFactory({
			type: RateLimitType.CheckOrg,
			config: {
				name: "test-check-org",
				limit: 1,
				windowMs: 60_000,
				notInRedis: true,
				scope: RateLimitScope.Org,
				overLimit: "degrade",
			},
		});

		app.use("*", async (c, next) => {
			c.set("ctx", {
				env: "live",
				org: { id: "org_123", slug: "test-org" },
			} as never);
			return middleware(c as never, next);
		});
		app.post("/v1/customers", (c) => c.json({ success: true }));

		const firstResponse = await app.request("/v1/customers", {
			method: "POST",
		});
		const limitedResponse = await app.request("/v1/customers", {
			method: "POST",
		});

		expect(firstResponse.status).toBe(200);
		expect(limitedResponse.status).toBe(429);
		expect(limitedResponse.headers.get("Retry-After")).toBeNull();
		expect(await limitedResponse.json()).toEqual({
			message: "Rate limit exceeded.",
			code: "rate_limit_exceeded",
			env: "live",
		});
	});
});

afterAll(() => {
	mock.restore();
});
