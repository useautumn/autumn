import { describe, expect, mock, test } from "bun:test";

const mockState = {
	v2Calls: [] as Record<string, unknown>[],
	v3Calls: [] as Record<string, unknown>[],
	v3Error: null as unknown,
	queueCalls: [] as Record<string, unknown>[],
	queueResponse: null as unknown,
};

mock.module("@/internal/balances/track/runTrackV2.js", () => ({
	runTrackV2: async (args: Record<string, unknown>) => {
		mockState.v2Calls.push(args);
		return { source: "v2" };
	},
}));

mock.module("@/internal/balances/track/v3/runTrackV3.js", () => ({
	runTrackV3: async (args: Record<string, unknown>) => {
		mockState.v3Calls.push(args);
		if (mockState.v3Error) throw mockState.v3Error;

		return { source: "v3" };
	},
}));

mock.module("@/internal/balances/track/utils/queueTrack.js", () => ({
	queueTrack: async (args: Record<string, unknown>) => {
		mockState.queueCalls.push(args);
		return mockState.queueResponse;
	},
}));

import {
	runTrackWithRollout,
	shouldUseTrackV3,
} from "@/internal/balances/track/runTrackWithRollout.js";

describe("runTrackWithRollout", () => {
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

	test("queues track fallback when track v3 hits a retryable error", async () => {
		mockState.v2Calls = [];
		mockState.v3Calls = [];
		mockState.queueCalls = [];
		mockState.v3Error = Object.assign(new Error("redis retries exhausted"), {
			name: "MaxRetriesPerRequestError",
		});
		mockState.queueResponse = { queued: true };

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
			featureDeductions: [],
		});

		expect(result as unknown).toEqual({ queued: true });
		expect(mockState.v3Calls).toHaveLength(1);
		expect(mockState.v2Calls).toHaveLength(0);
		expect(mockState.queueCalls).toHaveLength(1);
	});
});
