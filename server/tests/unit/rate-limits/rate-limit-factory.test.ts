import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	shouldUseRedis: false,
	warnings: [] as string[],
};

await mockModuleWithRestore("@/external/redis/initRedis", () => ({
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

await mockModuleWithRestore("@/external/logtail/logtailUtils.js", () => ({
	logger: mockLogger,
}));

import { createLayerLimiter } from "@/internal/misc/rateLimiter/layerLimiter/createLayerLimiter.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

describe("createLayerLimiter", () => {
	beforeEach(() => {
		mockState.shouldUseRedis = false;
		mockState.warnings = [];
	});

	test("fails open and warns when Redis is unavailable", async () => {
		let nextCalls = 0;
		const middleware = createLayerLimiter({
			layer: { name: "test", limit: 5, windowMs: 1000 },
			scope: "perOrg",
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
		const middleware = createLayerLimiter({
			layer: {
				name: "test-check-org",
				limit: 1,
				windowMs: 60_000,
				counted: "perPod",
				overLimit: "rejectAndQueueCreate",
			},
			scope: "perOrg",
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

	test("serves an over-limit degrade request and flags the context", async () => {
		const app = new Hono<HonoEnv>();
		const middleware = createLayerLimiter({
			layer: {
				name: "test-track-org",
				limit: 1,
				windowMs: 60_000,
				counted: "perPod",
				overLimit: "degrade",
			},
			scope: "perOrg",
		});
		const degradedFlags: (boolean | undefined)[] = [];

		app.use("*", async (c, next) => {
			c.set("ctx", {
				env: "live",
				org: { id: "org_123", slug: "test-org" },
			} as never);
			return middleware(c as never, next);
		});
		app.post("/v1/track", (c) => {
			degradedFlags.push(c.get("ctx").orgRateLimitDegraded);
			return c.json({ success: true });
		});

		const firstResponse = await app.request("/v1/track", { method: "POST" });
		const degradedResponse = await app.request("/v1/track", {
			method: "POST",
		});

		expect(firstResponse.status).toBe(200);
		expect(degradedResponse.status).toBe(200);
		expect(degradedResponse.headers.get("Retry-After")).toBeNull();
		expect(degradedFlags).toEqual([undefined, true]);
	});
});

afterAll(() => {
	mock.restore();
});
