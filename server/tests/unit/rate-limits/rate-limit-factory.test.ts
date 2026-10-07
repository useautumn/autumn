import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const mockState = {
	shouldUseRedis: false,
	warnings: [] as string[],
	redisHits: new Map<string, number>(),
};

await mockModuleWithRestore("@/external/redis/initRedis", () => ({
	redis: {},
	shouldUseRedis: () => mockState.shouldUseRedis,
}));

// A Redis counter stand-in: what the factory sends to Redis is observable here.
await mockModuleWithRestore(
	"@/internal/misc/rateLimiter/rateLimitRedisStore",
	() => ({
		createRateLimitRedisStore: () => ({
			increment: async (key: string) => {
				const totalHits = (mockState.redisHits.get(key) ?? 0) + 1;
				mockState.redisHits.set(key, totalHits);
				return { totalHits, resetTime: new Date(Date.now() + 60_000) };
			},
			decrement: async () => undefined,
			resetKey: async () => undefined,
		}),
	}),
);

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

import {
	type RateLimitConfig,
	RateLimitScope,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import {
	rateLimitFactory,
	setRateLimitKeyInContext,
} from "@/internal/misc/rateLimiter/rateLimitFactory.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const buildApp = ({
	type,
	config,
	key,
}: {
	type: RateLimitType;
	config: RateLimitConfig;
	key: string;
}) => {
	const app = new Hono<HonoEnv>();
	const middleware = rateLimitFactory({ type, config });
	const seenContexts: { orgRateLimitDegraded?: boolean }[] = [];

	app.use("*", async (c, next) => {
		const ctx = {
			env: "live",
			org: { id: "org_123", slug: "test-org" },
		} as { orgRateLimitDegraded?: boolean };
		c.set("ctx", ctx as never);
		setRateLimitKeyInContext(c as never, key);
		return middleware(c as never, next);
	});
	app.post("/v1/track", (c) => {
		seenContexts.push(c.get("ctx") as { orgRateLimitDegraded?: boolean });
		return c.json({ success: true });
	});

	return {
		request: () => app.request("/v1/track", { method: "POST" }),
		seenContexts,
	};
};

const perCustomerConfig = (
	store: RateLimitConfig["store"],
): RateLimitConfig => ({
	limit: 1,
	windowMs: 60_000,
	scope: RateLimitScope.Customer,
	store,
});

describe("rateLimitFactory", () => {
	beforeEach(() => {
		mockState.shouldUseRedis = false;
		mockState.warnings = [];
		mockState.redisHits = new Map();
	});

	test("a memory bucket counts in-process even when Redis is up", async () => {
		mockState.shouldUseRedis = true;
		const { request } = buildApp({
			type: RateLimitType.Track,
			config: perCustomerConfig("memory"),
			key: "track:org_123:live:cus_1",
		});

		expect((await request()).status).toBe(200);
		expect((await request()).status).toBe(429);
		expect(mockState.redisHits.size).toBe(0);
	});

	test("a redis bucket counts in Redis when Redis is up", async () => {
		mockState.shouldUseRedis = true;
		const { request } = buildApp({
			type: RateLimitType.Attach,
			config: perCustomerConfig("redis"),
			key: "attach:org_123:live:cus_1",
		});

		expect((await request()).status).toBe(200);
		expect((await request()).status).toBe(429);
		expect(mockState.redisHits.get("attach:org_123:live:cus_1")).toBe(2);
	});

	test("a redis bucket fails open and warns when Redis is unavailable", async () => {
		const { request } = buildApp({
			type: RateLimitType.Attach,
			config: perCustomerConfig("redis"),
			key: "attach:org_123:live:cus_1",
		});

		expect((await request()).status).toBe(200);
		expect((await request()).status).toBe(200);
		expect(mockState.warnings).toEqual([
			"[rate-limit] Redis unavailable; bypassing distributed rate limiting",
		]);
	});

	test("an over-limit degrade bucket runs the handler with the org flagged", async () => {
		const { request, seenContexts } = buildApp({
			type: RateLimitType.TrackOrg,
			config: {
				limit: 1,
				windowMs: 60_000,
				scope: RateLimitScope.Org,
				store: "memory",
				overLimit: "degrade",
			},
			key: "track_org:org_123:live",
		});

		const firstResponse = await request();
		const degradedResponse = await request();

		expect(firstResponse.status).toBe(200);
		expect(degradedResponse.status).toBe(200);
		expect(degradedResponse.headers.get("Retry-After")).toBeNull();
		expect(degradedResponse.headers.get("RateLimit-Remaining")).toBe("0");
		expect(seenContexts.map((ctx) => ctx.orgRateLimitDegraded)).toEqual([
			undefined,
			true,
		]);
		expect(mockState.warnings).toEqual([
			"[rate-limit] org aggregate cap exceeded: test-org (track_org)",
		]);
	});
});

afterAll(() => {
	mock.restore();
});
