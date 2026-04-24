import { beforeEach, describe, expect, mock, test } from "bun:test";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";

const mockState = {
	shouldUseRedis: true,
	runTrackV2Calls: [] as Record<string, unknown>[],
	runTrackV3Calls: [] as Record<string, unknown>[],
	queueTrackCalls: [] as Record<string, unknown>[],
	runTrackV3Error: null as unknown,
	queueTrackResult: undefined as Record<string, unknown> | null | undefined,
};

mock.module("@/external/redis/initUtils/redisV2Availability.js", () => ({
	shouldUseRedisV2: () => mockState.shouldUseRedis,
}));

mock.module("@/internal/balances/track/runTrackV2.js", () => ({
	runTrackV2: async (args: Record<string, unknown>) => {
		mockState.runTrackV2Calls.push(args);
		return { source: "v2" };
	},
}));

mock.module("@/internal/balances/track/v3/runTrackV3.js", () => ({
	runTrackV3: async (args: Record<string, unknown>) => {
		mockState.runTrackV3Calls.push(args);
		if (mockState.runTrackV3Error) throw mockState.runTrackV3Error;
		return { source: "v3" };
	},
}));

mock.module("@/internal/balances/track/utils/queueTrack.js", () => ({
	queueTrack: async (args: Record<string, unknown>) => {
		mockState.queueTrackCalls.push(args);
		return mockState.queueTrackResult ?? null;
	},
}));

import {
	runTrackWithRollout,
	shouldUseTrackV3,
} from "@/internal/balances/track/runTrackWithRollout.js";

describe("runTrackWithRollout", () => {
	beforeEach(() => {
		mockState.shouldUseRedis = true;
		mockState.runTrackV2Calls = [];
		mockState.runTrackV3Calls = [];
		mockState.queueTrackCalls = [];
		mockState.runTrackV3Error = null;
		mockState.queueTrackResult = undefined;
	});

	test("keeps track v3 disabled when rollout is off", () => {
		expect(
			shouldUseTrackV3({
				ctx: {
					rolloutSnapshot: undefined,
				} as never,
			}),
		).toBe(false);
	});

	test("enables track v3 when v2-cache rollout is enabled", () => {
		expect(
			shouldUseTrackV3({
				ctx: {
					rolloutSnapshot: {
						rolloutId: "v2-cache",
						enabled: true,
						percent: 100,
						previousPercent: 0,
						changedAt: 1,
						customerBucket: 5,
					},
				} as never,
			}),
		).toBe(true);
	});

	test("falls back to track v2 when rollout is off", async () => {
		const result = await runTrackWithRollout({
			ctx: {
				rolloutSnapshot: undefined,
			} as never,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			featureDeductions: [] as never,
		});

		expect(result).toMatchObject({ source: "v2" });
		expect(mockState.runTrackV2Calls).toHaveLength(1);
		expect(mockState.runTrackV3Calls).toHaveLength(0);
		expect(mockState.queueTrackCalls).toHaveLength(0);
	});

	test("queues fail-open response on RedisUnavailableError from track v3", async () => {
		mockState.runTrackV3Error = new RedisUnavailableError({
			source: "runTrackV3",
			reason: "timeout",
		});
		mockState.queueTrackResult = { queued: true, source: "queued" };

		const result = await runTrackWithRollout({
			ctx: {
				rolloutSnapshot: {
					rolloutId: "v2-cache",
					enabled: true,
					percent: 100,
					previousPercent: 0,
					changedAt: 1,
					customerBucket: 5,
				},
			} as never,
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			featureDeductions: [] as never,
		});

		expect(result).toMatchObject({ queued: true, source: "queued" });
		expect(mockState.runTrackV2Calls).toHaveLength(0);
		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.queueTrackCalls).toHaveLength(1);
	});

	test("rethrows RedisUnavailableError when queue fallback cannot respond", async () => {
		mockState.runTrackV3Error = new RedisUnavailableError({
			source: "runTrackV3",
			reason: "timeout",
		});
		mockState.queueTrackResult = null;

		await expect(
			runTrackWithRollout({
				ctx: {
					rolloutSnapshot: {
						rolloutId: "v2-cache",
						enabled: true,
						percent: 100,
						previousPercent: 0,
						changedAt: 1,
						customerBucket: 5,
					},
				} as never,
				body: { customer_id: "cus_123", feature_id: "messages" } as never,
				featureDeductions: [] as never,
			}),
		).rejects.toBe(mockState.runTrackV3Error);

		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.queueTrackCalls).toHaveLength(1);
	});
});
