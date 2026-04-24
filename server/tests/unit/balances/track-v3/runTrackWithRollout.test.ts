import { beforeEach, describe, expect, test } from "bun:test";
import type { TrackResponseV3 } from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";

type MockTrackResponse = TrackResponseV3 & {
	source?: string;
	queued?: boolean;
};

import {
	runTrackWithRollout,
	shouldUseTrackV3,
} from "@/internal/balances/track/runTrackWithRollout.js";

const mockState = {
	runTrackV2Calls: [] as Record<string, unknown>[],
	runTrackV3Calls: [] as Record<string, unknown>[],
	queueTrackCalls: [] as Record<string, unknown>[],
	runTrackV3Error: null as unknown,
	queueTrackResult: undefined as MockTrackResponse | null | undefined,
};

const deps = {
	withRedisFailOpen: async <T>({
		run,
		fallback,
	}: {
		run: () => Promise<T> | T;
		fallback: (error: unknown) => Promise<T> | T;
	}) => {
		try {
			return await run();
		} catch (error) {
			if (
				error instanceof RedisUnavailableError ||
				(error instanceof Error &&
					error.message === "Connection is closed.")
			) {
				return await fallback(error);
			}
			throw error;
		}
	},
	runTrackV2: async (args: Record<string, unknown>) => {
		mockState.runTrackV2Calls.push(args);
		return {
			source: "v2",
			customer_id: "cus_123",
			value: 1,
			balance: null,
		};
	},
	runTrackV3: async (args: Record<string, unknown>) => {
		mockState.runTrackV3Calls.push(args);
		if (mockState.runTrackV3Error) throw mockState.runTrackV3Error;
		return {
			source: "v3",
			customer_id: "cus_123",
			value: 1,
			balance: null,
		};
	},
	queueTrack: async (args: Record<string, unknown>) => {
		mockState.queueTrackCalls.push(args);
		return mockState.queueTrackResult ?? null;
	},
};

describe("runTrackWithRollout", () => {
	beforeEach(() => {
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
			deps,
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
		mockState.queueTrackResult = {
			queued: true,
			source: "queued",
			customer_id: "cus_123",
			value: 1,
			balance: null,
		};

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
			deps,
		});

		expect(result).toMatchObject({ queued: true, source: "queued" });
		expect(mockState.runTrackV2Calls).toHaveLength(0);
		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.queueTrackCalls).toHaveLength(1);
	});

	test("queues fail-open response on closed-connection Redis errors", async () => {
		mockState.runTrackV3Error = new Error("Connection is closed.");
		mockState.queueTrackResult = {
			queued: true,
			source: "queued",
			customer_id: "cus_123",
			value: 1,
			balance: null,
		};

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
			deps,
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
				deps,
			}),
		).rejects.toBe(mockState.runTrackV3Error);

		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.queueTrackCalls).toHaveLength(1);
	});
});
