/**
 * TDD test for the finalizeLock queue fallback.
 *
 * Contract under test:
 *   New types/fields:
 *     - JobName.FinalizeLock = "finalize-lock" queued to TRACK_SQS_QUEUE_URL
 *     - payload: { orgId, env, customerId?, requestId, params }
 *     - ctx.extraLogs.finalizeLockQueuedForReplay: true when queued
 *   New behaviors (runFinalizeLock):
 *     - transient Redis/DB error or not_ready outage -> claim marker released
 *       (best-effort), job queued (group org:env:lock:<lock_id>, dedup
 *       ctx.id), returns { success: true } + queued extras flag
 *     - queue unavailable -> original error rethrown (no fake success)
 *     - non-transient errors propagate untouched, nothing queued
 *   New behaviors (runQueuedFinalizeLock):
 *     - "Lock not found" -> resolved as already-finalized success
 *     - transient errors -> rethrown (no re-queue; SQS redelivery owns retry)
 *
 * Pre-impl red: queueFinalizeLock / runQueuedFinalizeLock /
 * releaseLockClaimMarker do not exist and runFinalizeLock still returns a
 * fake { success: true } fallback.
 * Post-impl green: all assertions pass once the queue fallback ships.
 */

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";

const trackQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo";

const mockState = {
	queueCommands: [] as Record<string, unknown>[],
	queueError: null as Error | null,
	originalSend: null as ReturnType<typeof getSqsClient>["send"] | null,
	fetchBehaviors: [] as (Error | "ok")[],
	fetchCalls: 0,
	v2Behaviors: [] as (Error | "ok")[],
	v2Calls: 0,
	releaseClaimCalls: [] as Record<string, unknown>[],
	redisV2Ready: true,
};

const nextBehavior = (behaviors: (Error | "ok")[]) => {
	const behavior = behaviors.length > 1 ? behaviors.shift() : behaviors[0];
	if (behavior instanceof Error) throw behavior;
};

mock.module("@/external/redis/initUtils/redisV2Availability.js", () => ({
	shouldUseRedisV2: () => mockState.redisV2Ready,
	getRedisV2Availability: () => ({ configured: true, state: "ready" }),
	primeRedisV2Monitor: () => {},
	startRedisV2Monitor: () => {},
	stopRedisV2Monitor: () => {},
}));

mock.module("@/internal/balances/utils/lock/fetchLockReceipt.js", () => ({
	fetchLockReceipt: async () => {
		mockState.fetchCalls += 1;
		nextBehavior(mockState.fetchBehaviors);
		return {
			receipt: { customer_id: "cus_123", feature_id: "messages", items: [] },
			lockReceiptKey: "{org_123}:sandbox:lock:hashed",
			claimed: true,
			redisInstance: {},
		};
	},
}));

mock.module("@/internal/balances/finalizeLock/runFinalizeLockV2.js", () => ({
	runFinalizeLockV2: async () => {
		mockState.v2Calls += 1;
		nextBehavior(mockState.v2Behaviors);
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

import { runFinalizeLock } from "@/internal/balances/finalizeLock/runFinalizeLock.js";
import { runQueuedFinalizeLock } from "@/internal/balances/finalizeLock/runQueuedFinalizeLock.js";

const params = {
	lock_id: "lock_abc",
	action: "confirm" as const,
	override_value: 5,
};

const makeCtx = () =>
	({
		id: "req_fin_123",
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		customerId: "cus_123",
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		logger: { warn: () => undefined, info: () => undefined },
		extraLogs: {},
	}) as unknown as AutumnContext;

const originalTrackQueueUrl = process.env.TRACK_SQS_QUEUE_URL;

describe("runFinalizeLock queue fallback", () => {
	beforeEach(() => {
		mockState.queueCommands = [];
		mockState.queueError = null;
		mockState.fetchBehaviors = ["ok"];
		mockState.fetchCalls = 0;
		mockState.v2Behaviors = ["ok"];
		mockState.v2Calls = 0;
		mockState.releaseClaimCalls = [];
		mockState.redisV2Ready = true;
		process.env.TRACK_SQS_QUEUE_URL = trackQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: trackQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			if (mockState.queueError) throw mockState.queueError;
			mockState.queueCommands.push(command.input);
			return {};
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		const sqsClient = getSqsClient({ queueUrl: trackQueueUrl });
		if (mockState.originalSend) sqsClient.send = mockState.originalSend;
	});

	// ── Contract: transient Redis error queues the replay ───────────────────
	test("queues the finalize replay on a transient Redis error", async () => {
		const ctx = makeCtx();
		mockState.v2Behaviors = [
			new RedisUnavailableError({ source: "test", reason: "not_ready" }),
		];

		const response = await runFinalizeLock({ ctx, params });

		expect(response).toEqual({ success: true });
		expect(mockState.v2Calls).toBe(1);
		expect(mockState.queueCommands).toHaveLength(1);
		expect(mockState.queueCommands[0]).toMatchObject({
			QueueUrl: trackQueueUrl,
			MessageGroupId: "org_123:sandbox:lock:lock_abc",
			MessageDeduplicationId: "req_fin_123",
		});
		const body = JSON.parse(
			mockState.queueCommands[0]?.MessageBody as string,
		) as Record<string, unknown>;
		expect(body).toMatchObject({
			name: "finalize-lock",
			data: {
				orgId: "org_123",
				env: AppEnv.Sandbox,
				customerId: "cus_123",
				requestId: "req_fin_123",
				params,
			},
		});
		expect(ctx.extraLogs.finalizeLockQueuedForReplay).toBe(true);
		expect(mockState.releaseClaimCalls.length).toBeGreaterThanOrEqual(1);
	});

	// ── Contract: redis not ready before the first attempt -> straight to queue
	test("queues immediately when redis is not ready, without attempting", async () => {
		const ctx = makeCtx();
		mockState.redisV2Ready = false;

		const response = await runFinalizeLock({ ctx, params });

		expect(response).toEqual({ success: true });
		expect(mockState.v2Calls).toBe(0);
		expect(mockState.fetchCalls).toBe(0);
		expect(mockState.queueCommands).toHaveLength(1);
	});

	// ── Contract: raw transient Redis errors also queue ─────────────────────
	test("queues on a raw closed-connection Redis error", async () => {
		const ctx = makeCtx();
		mockState.v2Behaviors = [new Error("Connection is closed.")];

		const response = await runFinalizeLock({ ctx, params });

		expect(response).toEqual({ success: true });
		expect(mockState.v2Calls).toBe(1);
		expect(mockState.queueCommands).toHaveLength(1);
	});

	// ── Contract: transient DB error also queues ────────────────────────────
	test("queues on a transient DB error", async () => {
		const ctx = makeCtx();
		mockState.v2Behaviors = [new Error("Connection terminated unexpectedly")];

		const response = await runFinalizeLock({ ctx, params });

		expect(response).toEqual({ success: true });
		expect(mockState.v2Calls).toBe(1);
		expect(mockState.queueCommands).toHaveLength(1);
	});

	// ── Contract: queue failure rethrows the original error ─────────────────
	test("rethrows the original error when the queue fallback fails", async () => {
		const ctx = makeCtx();
		const outage = new RedisUnavailableError({
			source: "test",
			reason: "not_ready",
		});
		mockState.v2Behaviors = [outage];
		mockState.queueError = new Error("sqs unavailable");

		await expect(runFinalizeLock({ ctx, params })).rejects.toBe(outage);
		expect(mockState.queueCommands).toHaveLength(0);
	});

	// ── Contract: non-transient errors propagate, nothing queued ────────────
	test("propagates non-transient errors without retry or queueing", async () => {
		const ctx = makeCtx();
		mockState.v2Behaviors = [
			new RecaseError({
				message: "Lock receipt not claimable: RESERVATION_ALREADY_PROCESSING",
				code: ErrCode.InvalidRequest,
				statusCode: 409,
				data: { blockingStatus: "RESERVATION_ALREADY_PROCESSING" },
			}),
		];

		await expect(runFinalizeLock({ ctx, params })).rejects.toBeInstanceOf(
			RecaseError,
		);
		expect(mockState.v2Calls).toBe(1);
		expect(mockState.queueCommands).toHaveLength(0);
	});
});

describe("runQueuedFinalizeLock", () => {
	beforeEach(() => {
		mockState.queueCommands = [];
		mockState.queueError = null;
		mockState.fetchBehaviors = ["ok"];
		mockState.fetchCalls = 0;
		mockState.v2Behaviors = ["ok"];
		mockState.v2Calls = 0;
		mockState.releaseClaimCalls = [];
		mockState.redisV2Ready = true;
	});

	// ── Contract: replay treats Lock not found as already resolved ──────────
	test("resolves without error when the lock receipt no longer exists", async () => {
		const ctx = makeCtx();
		mockState.fetchBehaviors = [
			new RecaseError({
				message: "Lock not found for ID: lock_abc",
				code: ErrCode.InvalidRequest,
			}),
		];

		await expect(runQueuedFinalizeLock({ ctx, params })).resolves.toBeDefined();
	});

	// ── Contract: replay rethrows transient errors instead of re-queueing ───
	test("rethrows transient errors so SQS redelivery owns the retry", async () => {
		const ctx = makeCtx();
		mockState.v2Behaviors = [new Error("Command timed out")];

		await expect(runQueuedFinalizeLock({ ctx, params })).rejects.toThrow(
			"Command timed out",
		);
		expect(mockState.queueCommands).toHaveLength(0);
	});
});

afterAll(() => {
	process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
	mock.restore();
});
