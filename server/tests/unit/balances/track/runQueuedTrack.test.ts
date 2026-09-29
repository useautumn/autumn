import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFakeMiscCache } from "../../utils/fakeMiscCache.js";

// These cover the legacy replay; the worker case turns the rollout on itself.
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";

const mockState = {
	workerTrackCalls: [] as Record<string, unknown>[],
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
	"@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js",
	() => ({
		runBalanceWorkerTrack: async (args: Record<string, unknown>) => {
			mockState.workerTrackCalls.push(args);
			return { customer_id: "cus_123", balance: null };
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

// Local Dynamo may already hold sticky keys from prior runs — claim must not
// 409 and skip the replay body under test.
await mockModuleWithRestore(
	"@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js",
	() => ({
		claimDynamoIdempotencyKey: async () => "claimed",
	}),
);

// CI has no misc cache env — the idempotency claim's getMiscRedis() would throw.
const fakeMiscRedis = {
	status: "ready",
	get: async () => null,
	set: async () => "OK",
	del: async () => 1,
} as never;
const fakeMiscCache = createFakeMiscCache({ main: fakeMiscRedis });
await mockModuleWithRestore(
	"@/external/redis/miscCache/getMiscCache.js",
	() => ({
		getMiscCache: () => fakeMiscCache,
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
		mockState.workerTrackCalls = [];
		mockState.runTrackV3Calls = [];
		mockState.getFeatureDeductionCalls = [];
		mockState.runTrackV3Error = null;
	});

	test("with the balance worker on, replays on the worker without claiming the key twice", async () => {
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
		try {
			const body = {
				customer_id: "cus_123",
				feature_id: "messages",
				idempotency_key: "queued-track-worker",
				value: 1,
			};
			await runQueuedTrack({ ctx, body, apiVersion: ApiVersion.V2_1 });

			expect(mockState.workerTrackCalls).toHaveLength(1);
			expect(mockState.workerTrackCalls[0]).toMatchObject({
				body,
				validateTrackBodyIdempotencyKey: false,
			});
			expect(mockState.runTrackV3Calls).toHaveLength(0);
		} finally {
			process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
		}
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
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});
