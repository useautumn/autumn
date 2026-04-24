import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	runTrackV3Calls: [] as Record<string, unknown>[],
	getFeatureDeductionCalls: [] as Record<string, unknown>[],
	runTrackV3Error: null as unknown,
};

mock.module("@/internal/balances/track/utils/getFeatureDeductions.js", () => ({
	getTrackFeatureDeductionsForBody: (args: Record<string, unknown>) => {
		mockState.getFeatureDeductionCalls.push(args);
		return [];
	},
}));

mock.module("@/internal/balances/track/v3/runTrackV3.js", () => ({
	runTrackV3: async (args: Record<string, unknown>) => {
		mockState.runTrackV3Calls.push(args);
		if (mockState.runTrackV3Error) throw mockState.runTrackV3Error;
		return { customer_id: "cus_123", balance: null };
	},
}));

import { runQueuedTrack } from "@/internal/balances/track/runQueuedTrack.js";

const ctx = {
	id: "req_123",
	env: AppEnv.Sandbox,
	org: { id: "org_123" },
	apiVersion: new ApiVersionClass(ApiVersion.V2_1),
	logger: {
		info: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("runQueuedTrack", () => {
	beforeEach(() => {
		mockState.runTrackV3Calls = [];
		mockState.getFeatureDeductionCalls = [];
		mockState.runTrackV3Error = null;
	});

	test("replays queued track through runTrackV3", async () => {
		await runQueuedTrack({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				value: 1,
			},
			apiVersion: ApiVersion.V2_1,
		});

		expect(mockState.getFeatureDeductionCalls).toHaveLength(1);
		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.runTrackV3Calls[0]).toMatchObject({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
			},
			featureDeductions: [],
			apiVersion: ApiVersion.V2_1,
		});
	});

	test("treats duplicate idempotency as already applied", async () => {
		mockState.runTrackV3Error = new RecaseError({
			message: "duplicate",
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
		});

		await expect(
			runQueuedTrack({
				ctx,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
					value: 1,
				},
				apiVersion: ApiVersion.V2_1,
			}),
		).resolves.toBeUndefined();
	});
});
