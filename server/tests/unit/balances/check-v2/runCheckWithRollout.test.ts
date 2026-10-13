import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";

const mockState = {
	shouldUseRedis: true,
	v2Calls: [] as Record<string, unknown>[],
	v2Error: null as unknown,
	warnCalls: [] as unknown[][],
	queueTrackCalls: [] as Record<string, unknown>[],
	queueRefuses: false,
};

await mockModuleWithRestore(
	"@/external/redis/availabilityMonitor/redisV2Availability.js",
	() => ({
		shouldUseRedisV2: () => mockState.shouldUseRedis,
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/track/utils/queueTrack.js",
	() => ({
		queueTrack: async (args: Record<string, unknown>) => {
			mockState.queueTrackCalls.push(args);
			return mockState.queueRefuses ? null : { balance: null };
		},
	}),
);

await mockModuleWithRestore("@/internal/balances/check/runCheckV2.js", () => ({
	runCheckV2: async (args: Record<string, unknown>) => {
		mockState.v2Calls.push(args);
		if (mockState.v2Error) throw mockState.v2Error;

		return {
			checkData: { source: "v2" },
			response: { allowed: true, source: "v2" },
		};
	},
}));

import {
	ApiVersionClass,
	FeatureType,
	LATEST_VERSION,
	RecaseError,
} from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { getCheckFailOpenFallback } from "@/internal/api/check/checkUtils/getCheckFailOpenFallback.js";
import { runCheckWithRollout } from "@/internal/balances/check/runCheckWithRollout.js";

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const resetMockState = () => {
	mockState.shouldUseRedis = true;
	mockState.v2Calls = [];
	mockState.v2Error = null;
	mockState.warnCalls = [];
	mockState.queueTrackCalls = [];
	mockState.queueRefuses = false;
};

beforeEach(resetMockState);
afterEach(resetMockState);

const rolloutCtx = {
	apiVersion: new ApiVersionClass(LATEST_VERSION),
	org: { id: "org_test" },
	env: "sandbox",
	features: [
		{ id: "messages", internal_id: "fe_messages", type: FeatureType.Metered },
		{ id: "sso", internal_id: "fe_sso", type: FeatureType.Boolean },
	],
	logger: {
		warn: (...args: unknown[]) => mockState.warnCalls.push(args),
	},
} as never;

const sendEventBody = {
	customer_id: "cus_123",
	entity_id: "ent_1",
	feature_id: "messages",
	send_event: true,
	properties: { model: "small" },
} as never;

describe("runCheckWithRollout", () => {
	test("logs the route timeout reason explicitly", () => {
		getCheckFailOpenFallback({
			ctx: rolloutCtx,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			requiredBalance: 1,
			error: new Error("blanket timeout"),
			reason: "route_timeout",
		});

		expect(mockState.warnCalls).toContainEqual([
			"[check] Returning fail-open fallback response",
			expect.objectContaining({
				type: "check_fail_open_fallback",
				fail_open_reason: "route_timeout",
			}),
		]);
	});

	test("uses the v2 flow", async () => {
		const result = await runCheckWithRollout({
			ctx: {} as never,
			body: {} as never,
			requiredBalance: 1,
		});

		expect(mockState.v2Calls).toHaveLength(1);
		expect(result).toMatchObject({
			checkData: { source: "v2" },
			response: { source: "v2" },
		});
	});

	test("returns fail-open fallback when Redis health is degraded", async () => {
		mockState.shouldUseRedis = false;

		const result = await runCheckWithRollout({
			ctx: rolloutCtx,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(mockState.v2Calls).toHaveLength(0);
		expect(result).toMatchObject({
			checkData: null,
			response: {
				allowed: true,
				customer_id: "cus_123",
				required_balance: 1,
				balance: null,
				flag: null,
			},
		});
	});

	test.each([
		{
			name: "DB statement timeout",
			error: Object.assign(new Error("statement timeout"), { code: "57014" }),
		},
		{
			name: "DB connect timeout",
			error: Object.assign(new Error("connect timeout"), {
				code: "CONNECT_TIMEOUT",
			}),
		},
		{
			name: "Redis unavailable",
			error: new RedisUnavailableError({
				source: "unit-test",
				reason: "timeout",
			}),
		},
		{
			name: "Redis command timeout",
			error: new Error("Command timed out"),
		},
	])("returns fail-open fallback on $name", async ({ error }) => {
		mockState.v2Error = error;

		const result = await runCheckWithRollout({
			ctx: rolloutCtx,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({
			checkData: null,
			response: {
				allowed: true,
				customer_id: "cus_123",
				required_balance: 1,
				balance: null,
				flag: null,
			},
		});
		expect(mockState.warnCalls).toContainEqual([
			"[check] Returning fail-open fallback response",
			expect.objectContaining({
				type: "check_fail_open_fallback",
				fail_open_reason: "dependency_error",
				feature_id: "messages",
				required_balance: 1,
			}),
		]);
	});

	test("throws non-transient errors", async () => {
		const error = new Error("application bug");
		mockState.v2Error = error;

		await expect(
			runCheckWithRollout({
				ctx: rolloutCtx,
				body: { customer_id: "cus_123", feature_id: "messages" } as never,
				requiredBalance: 1,
			}),
		).rejects.toBe(error);
	});
});

describe("runCheckWithRollout send_event fail-open", () => {
	test("queues the deduction the check would have made when Redis fails", async () => {
		mockState.v2Error = new RedisUnavailableError({
			source: "unit-test",
			reason: "timeout",
		});

		const result = await runCheckWithRollout({
			ctx: rolloutCtx,
			body: sendEventBody,
			requiredBalance: 3,
		});

		expect(result).toMatchObject({
			checkData: null,
			response: { allowed: true, balance: null },
		});
		expect(mockState.queueTrackCalls).toHaveLength(1);
		expect(mockState.queueTrackCalls[0]).toMatchObject({
			body: {
				customer_id: "cus_123",
				entity_id: "ent_1",
				feature_id: "messages",
				value: 3,
				properties: { model: "small" },
				overage_behavior: "reject",
			},
		});
		expect(mockState.warnCalls).toContainEqual([
			"[check] Returning fail-open fallback response",
			expect.objectContaining({ deduction_queued: true }),
		]);
	});

	test("answers a retryable 503 when the deduction can't be queued", async () => {
		mockState.v2Error = new Error("Command timed out");
		mockState.queueRefuses = true;

		const outcome = runCheckWithRollout({
			ctx: rolloutCtx,
			body: sendEventBody,
			requiredBalance: 1,
		});

		await expect(outcome).rejects.toBeInstanceOf(RecaseError);
		await expect(outcome).rejects.toMatchObject({ statusCode: 503 });
	});

	test("queues on the org rate cap without running the check", async () => {
		const result = await runCheckWithRollout({
			ctx: { ...(rolloutCtx as object), orgRateLimitDegraded: true } as never,
			body: sendEventBody,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({ checkData: null });
		expect(mockState.v2Calls).toHaveLength(0);
		expect(mockState.queueTrackCalls).toHaveLength(1);
	});

	test("runs the check live on the org rate cap when the queue refuses, as track does", async () => {
		mockState.queueRefuses = true;

		const result = await runCheckWithRollout({
			ctx: { ...(rolloutCtx as object), orgRateLimitDegraded: true } as never,
			body: sendEventBody,
			requiredBalance: 1,
		});

		expect(mockState.v2Calls).toHaveLength(1);
		expect(result).toMatchObject({ checkData: { source: "v2" } });
	});

	test.each([
		{ name: "a plain check", body: { feature_id: "messages" }, ctx: {} },
		{
			name: "a lock check",
			body: {
				feature_id: "messages",
				send_event: true,
				lock: { enabled: true, lock_id: "lock_1" },
			},
			ctx: {},
		},
		{
			name: "a boolean feature",
			body: { feature_id: "sso", send_event: true },
			ctx: {},
		},
		{
			name: "an unknown feature",
			body: { feature_id: "nope", send_event: true },
			ctx: {},
		},
		{
			name: "a publishable key",
			body: { feature_id: "messages", send_event: true },
			ctx: { isPublic: true },
		},
	])("queues nothing for $name", async ({ body, ctx }) => {
		mockState.v2Error = new Error("Command timed out");

		const result = await runCheckWithRollout({
			ctx: { ...(rolloutCtx as object), ...ctx } as never,
			body: { customer_id: "cus_123", ...body } as never,
			requiredBalance: 1,
		});

		expect(result).toMatchObject({ response: { allowed: true } });
		expect(mockState.queueTrackCalls).toHaveLength(0);
	});
});

afterAll(() => {
	mock.restore();
});
