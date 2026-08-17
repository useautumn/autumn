import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	runTrackV3Calls: [] as Record<string, unknown>[],
	getFeatureDeductionCalls: [] as Record<string, unknown>[],
	runTrackV3Error: null as unknown,
};

await mockModuleWithRestore(
	"@/internal/balances/track/utils/getFeatureDeductions.js",
	() => ({
		getTrackFeatureDeductionsForBody: (args: Record<string, unknown>) => {
			mockState.getFeatureDeductionCalls.push(args);
			return [];
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/track/v3/runTrackV3.js",
	() => ({
		runTrackV3: async (args: Record<string, unknown>) => {
			mockState.runTrackV3Calls.push(args);
			if (mockState.runTrackV3Error) throw mockState.runTrackV3Error;
			return { customer_id: "cus_123", balance: null };
		},
	}),
);

// CI has no misc cache env — the idempotency claim's getMiscRedis() would throw.
const fakeMiscRedis = {
	status: "ready",
	get: async () => null,
	set: async () => "OK",
	del: async () => 1,
} as never;
await mockModuleWithRestore(
	"@/external/redis/miscCache/miscRedisInstances.js",
	() => ({
		getMiscMainRedis: () => fakeMiscRedis,
		getMiscBackupRedis: () => null,
	}),
);

import { runQueuedTrack } from "@/internal/balances/track/runQueuedTrack.js";

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const ctx = {
	id: "req_123",
	env: AppEnv.Sandbox,
	org: { id: "org_123" },
	apiVersion: new ApiVersionClass(ApiVersion.V2_1),
	logger: {
		info: mock(() => {}),
		// warn included: the idempotency path hands this logger to fire-and-forget
		// Dynamo-mirror work that logs failures after the test completes.
		warn: mock(() => {}),
	},
} as unknown as AutumnContext;

describe("runQueuedTrack", () => {
	beforeEach(() => {
		mockState.runTrackV3Calls = [];
		mockState.getFeatureDeductionCalls = [];
		mockState.runTrackV3Error = null;
	});

	test("replays queued track through runTrackV3", async () => {
		const timestamp = Date.now() - 10_000;
		await runQueuedTrack({
			ctx,
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
				idempotency_key: "queued-track-1",
				timestamp,
				value: 1,
				async: true,
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
				idempotency_key: "queued-track-1",
				timestamp,
				async: true,
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

	test("rethrows non-duplicate replay errors", async () => {
		const error = new Error("redis still unavailable");
		mockState.runTrackV3Error = error;

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
		).rejects.toBe(error);
	});
});

afterAll(() => {
	mock.restore();
});
