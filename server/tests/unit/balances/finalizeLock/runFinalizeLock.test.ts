import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockState = {
	shouldUseRedis: true,
	fetchError: null as unknown,
	finalizeV2Error: null as unknown,
	fetchCalls: [] as Record<string, unknown>[],
	finalizeV2Calls: [] as Record<string, unknown>[],
};

mock.module("@/external/redis/initUtils/redisV2Availability.js", () => ({
	shouldUseRedisV2: () => mockState.shouldUseRedis,
}));

mock.module("@/internal/balances/utils/lock/fetchLockReceipt.js", () => ({
	fetchLockReceipt: async (args: Record<string, unknown>) => {
		mockState.fetchCalls.push(args);
		if (mockState.fetchError) throw mockState.fetchError;

		return {
			source: "redis_v2",
			receipt: { customer_id: "cus_123", feature_id: "messages", items: [] },
			lockReceiptKey: "lock:receipt",
			claimed: true,
		};
	},
}));

mock.module("@/internal/balances/finalizeLock/runFinalizeLockV2.js", () => ({
	runFinalizeLockV2: async (args: Record<string, unknown>) => {
		mockState.finalizeV2Calls.push(args);
		if (mockState.finalizeV2Error) throw mockState.finalizeV2Error;

		return { success: true };
	},
}));

import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { runFinalizeLock } from "@/internal/balances/finalizeLock/runFinalizeLock.js";

const resetMockState = () => {
	mockState.shouldUseRedis = true;
	mockState.fetchError = null;
	mockState.finalizeV2Error = null;
	mockState.fetchCalls = [];
	mockState.finalizeV2Calls = [];
};

beforeEach(resetMockState);
afterEach(resetMockState);

const rolloutCtx = {
	org: { id: "org_123" },
	env: "sandbox",
	rolloutSnapshot: {
		rolloutId: "v2-cache",
		enabled: true,
		percent: 100,
		previousPercent: 0,
		changedAt: 1,
		customerBucket: 10,
	},
} as never;

const nonRolloutCtx = {
	org: { id: "org_123" },
	env: "sandbox",
	rolloutSnapshot: undefined,
} as never;

const params = {
	lock_id: "lock_123",
	action: "capture",
} as never;

describe("runFinalizeLock", () => {
	test("runs finalize v2 when the rollout is enabled", async () => {
		const result = await runFinalizeLock({ ctx: rolloutCtx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(1);
		expect(mockState.finalizeV2Calls).toHaveLength(1);
	});

	test("fails open when Redis is unavailable before fetching the receipt", async () => {
		mockState.shouldUseRedis = false;

		const result = await runFinalizeLock({ ctx: rolloutCtx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(0);
		expect(mockState.finalizeV2Calls).toHaveLength(0);
	});

	test("fails open when fetching the receipt hits a transient Redis error", async () => {
		mockState.fetchError = new RedisUnavailableError({
			source: "unit-test",
			reason: "timeout",
		});

		const result = await runFinalizeLock({ ctx: rolloutCtx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(1);
		expect(mockState.finalizeV2Calls).toHaveLength(0);
	});

	test("fails open when finalize v2 hits a transient Redis error", async () => {
		mockState.finalizeV2Error = new Error("Command timed out");

		const result = await runFinalizeLock({ ctx: rolloutCtx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(1);
		expect(mockState.finalizeV2Calls).toHaveLength(1);
	});

	test("does not fail open when the rollout is disabled", async () => {
		mockState.fetchError = new RedisUnavailableError({
			source: "unit-test",
			reason: "timeout",
		});

		await expect(runFinalizeLock({ ctx: nonRolloutCtx, params })).rejects.toBe(
			mockState.fetchError,
		);
		expect(mockState.fetchCalls).toHaveLength(1);
	});

	test("throws non-transient errors", async () => {
		const error = new Error("application bug");
		mockState.finalizeV2Error = error;

		await expect(runFinalizeLock({ ctx: rolloutCtx, params })).rejects.toBe(
			error,
		);
	});
});
