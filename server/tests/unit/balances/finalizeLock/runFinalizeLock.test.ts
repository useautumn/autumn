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
	fetchError: null as unknown,
	finalizeV2Error: null as unknown,
	fetchCalls: [] as Record<string, unknown>[],
	finalizeV2Calls: [] as Record<string, unknown>[],
	releaseClaimCalls: [] as Record<string, unknown>[],
	queueCalls: [] as Record<string, unknown>[],
	queueResponse: { success: true } as { success: true } | null,
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

mock.module(
	"@/internal/balances/utils/lockV2/releaseLockClaimMarker.js",
	() => ({
		releaseLockClaimMarker: async (args: Record<string, unknown>) => {
			mockState.releaseClaimCalls.push(args);
		},
	}),
);

mock.module("@/internal/balances/finalizeLock/queueFinalizeLock.js", () => ({
	queueFinalizeLock: async (args: Record<string, unknown>) => {
		mockState.queueCalls.push(args);
		return mockState.queueResponse;
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
	mockState.releaseClaimCalls = [];
	mockState.queueCalls = [];
	mockState.queueResponse = { success: true };
};

beforeEach(resetMockState);
afterEach(resetMockState);

const ctx = {
	org: { id: "org_123" },
	env: "sandbox",
	id: "req_123",
	logger: { warn: () => undefined, info: () => undefined },
	extraLogs: {},
} as never;

const params = {
	lock_id: "lock_123",
	action: "capture",
} as never;

describe("runFinalizeLock", () => {
	test("runs finalize v2", async () => {
		const result = await runFinalizeLock({ ctx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(1);
		expect(mockState.finalizeV2Calls).toHaveLength(1);
		expect(mockState.queueCalls).toHaveLength(0);
	});

	test("queues finalize replay when Redis is unavailable before fetching the receipt", async () => {
		mockState.shouldUseRedis = false;

		const result = await runFinalizeLock({ ctx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(0);
		expect(mockState.finalizeV2Calls).toHaveLength(0);
		expect(mockState.releaseClaimCalls).toHaveLength(1);
		expect(mockState.queueCalls).toHaveLength(1);
	});

	test("queues finalize replay when fetching the receipt hits a transient Redis error", async () => {
		mockState.fetchError = new RedisUnavailableError({
			source: "unit-test",
			reason: "timeout",
		});

		const result = await runFinalizeLock({ ctx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(1);
		expect(mockState.finalizeV2Calls).toHaveLength(0);
		expect(mockState.releaseClaimCalls).toHaveLength(1);
		expect(mockState.queueCalls).toHaveLength(1);
	});

	test("queues finalize replay when finalize v2 hits a transient Redis error", async () => {
		mockState.finalizeV2Error = new Error("Command timed out");

		const result = await runFinalizeLock({ ctx, params });

		expect(result).toEqual({ success: true });
		expect(mockState.fetchCalls).toHaveLength(1);
		expect(mockState.finalizeV2Calls).toHaveLength(1);
		expect(mockState.releaseClaimCalls).toHaveLength(1);
		expect(mockState.queueCalls).toHaveLength(1);
	});

	test("rethrows the original error when the queue fallback fails", async () => {
		mockState.shouldUseRedis = false;
		mockState.queueResponse = null;

		await expect(runFinalizeLock({ ctx, params })).rejects.toBeInstanceOf(
			RedisUnavailableError,
		);
		expect(mockState.queueCalls).toHaveLength(1);
	});

	test("throws non-transient errors", async () => {
		const error = new Error("application bug");
		mockState.finalizeV2Error = error;

		await expect(runFinalizeLock({ ctx, params })).rejects.toBe(error);
		expect(mockState.queueCalls).toHaveLength(0);
	});
});

afterAll(() => {
	mock.restore();
});
