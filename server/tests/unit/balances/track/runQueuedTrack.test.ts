import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS } from "@autumn/env/balanceWorkerConstants";
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

import { SpooledTrackTooOldError } from "@/internal/balances/track/balanceWorker/spool/spooledTrackReplay.js";
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
		error: mock(() => {}),
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

describe("runQueuedTrack with a spooled worker-path track", () => {
	const body = {
		customer_id: "cus_123",
		feature_id: "messages",
		value: 2,
		timestamp: 1_790_000_000_000,
	};
	const tokens = {
		usage: { modelName: "m", inputTokens: 1, outputTokens: 2 },
		cost: 2,
	};

	beforeEach(() => {
		mockState.workerTrackCalls = [];
		mockState.runTrackV3Calls = [];
		mockState.runTrackV3Error = null;
	});

	test("replays on the worker under the original request with its token cost", async () => {
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
		try {
			await runQueuedTrack({
				ctx,
				body,
				tokens,
				validateTrackBodyIdempotencyKey: false,
				spooledAt: Date.now() - 1_000,
			});
			expect(mockState.workerTrackCalls).toHaveLength(1);
			expect(mockState.workerTrackCalls[0]).toMatchObject({
				ctx,
				body,
				tokens,
				validateTrackBodyIdempotencyKey: false,
			});
		} finally {
			process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
		}
	});

	test("refuses a spool older than the worker's dedup window instead of risking a second deduction", async () => {
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
		try {
			await expect(
				runQueuedTrack({
					ctx,
					body,
					validateTrackBodyIdempotencyKey: false,
					spooledAt:
						Date.now() - BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS - 1_000,
				}),
			).rejects.toBeInstanceOf(SpooledTrackTooOldError);
			expect(mockState.workerTrackCalls).toHaveLength(0);
		} finally {
			process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
		}
	});

	test("replays on Redis when the customer moved off the worker before the replay, whatever its age", async () => {
		await runQueuedTrack({
			ctx,
			body,
			tokens,
			validateTrackBodyIdempotencyKey: false,
			spooledAt: Date.now() - BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS - 1_000,
		});
		expect(mockState.workerTrackCalls).toHaveLength(0);
		expect(mockState.runTrackV3Calls).toHaveLength(1);
		expect(mockState.runTrackV3Calls[0]).toMatchObject({ ctx, body });
	});
});

afterAll(() => {
	mock.restore();
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});
