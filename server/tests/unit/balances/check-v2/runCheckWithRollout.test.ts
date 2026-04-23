import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockState = {
	shouldUseRedis: true,
	legacyCalls: [] as Record<string, unknown>[],
	v2Calls: [] as Record<string, unknown>[],
	v2Error: null as unknown,
	warnCalls: [] as unknown[][],
};

mock.module("@/external/redis/initRedis.js", () => ({
	shouldUseRedis: () => mockState.shouldUseRedis,
}));

mock.module("@/internal/balances/check/runCheckLegacyFlow.js", () => ({
	runCheckLegacyFlow: async (args: Record<string, unknown>) => {
		mockState.legacyCalls.push(args);
		return {
			checkData: { source: "legacy" },
			response: { allowed: true, source: "legacy" },
		};
	},
}));

mock.module("@/internal/balances/check/runCheckV2.js", () => ({
	runCheckV2: async (args: Record<string, unknown>) => {
		mockState.v2Calls.push(args);
		if (mockState.v2Error) throw mockState.v2Error;

		return {
			checkData: { source: "v2" },
			response: { allowed: true, source: "v2" },
		};
	},
}));

import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { runCheckWithRollout } from "@/internal/balances/check/runCheckWithRollout.js";

beforeEach(() => {
	mockState.shouldUseRedis = true;
	mockState.legacyCalls = [];
	mockState.v2Calls = [];
	mockState.v2Error = null;
	mockState.warnCalls = [];
});

const rolloutCtx = {
	apiVersion: { value: "2025-02-01" },
	features: [],
	logger: {
		warn: (...args: unknown[]) => mockState.warnCalls.push(args),
	},
	rolloutSnapshot: {
		rolloutId: "v2-cache",
		enabled: true,
		percent: 100,
		previousPercent: 0,
		changedAt: 1,
		customerBucket: 10,
	},
} as never;

describe("runCheckWithRollout", () => {
	test("uses the legacy flow when the rollout is off", async () => {
		const result = await runCheckWithRollout({
			ctx: {
				rolloutSnapshot: undefined,
			} as never,
			body: {} as never,
			requiredBalance: 1,
		});

		expect(mockState.legacyCalls).toHaveLength(1);
		expect(mockState.v2Calls).toHaveLength(0);
		expect(result).toMatchObject({
			checkData: { source: "legacy" },
			response: { source: "legacy" },
		});
	});

	test("uses the v2 flow when the full-subject rollout is enabled", async () => {
		const result = await runCheckWithRollout({
			ctx: {
				rolloutSnapshot: {
					rolloutId: "v2-cache",
					enabled: true,
					percent: 100,
					previousPercent: 0,
					changedAt: 1,
					customerBucket: 10,
				},
			} as never,
			body: {} as never,
			requiredBalance: 1,
		});

		expect(mockState.legacyCalls).toHaveLength(0);
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
