/**
 * TDD test for the finalize-lock queued replay worker wiring.
 *
 * Contract under test:
 *   New behaviors:
 *     - processMessage builds a Redis-capable worker ctx (skipCache: false)
 *       for JobName.FinalizeLock messages
 *     - shouldRetrySqsJobError keeps FinalizeLock messages in SQS on
 *       transient Redis/DB errors and claim-contested 409s; app errors
 *       (Lock not found, generic) are not retried
 *   (End-to-end dispatch to runQueuedFinalizeLock is covered by
 *   tests/integration/balances/lock/finalize-lock-queued-replay.test.ts —
 *   module mocks can't intercept alias imports under a cache-busted parent.)
 *
 * Pre-impl red: JobName.FinalizeLock and the processMessage case do not exist.
 * Post-impl green: ctx construction + retry policy match the contract.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { Message } from "@aws-sdk/client-sqs";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { JobName } from "@/queue/JobName.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockState = {
	createWorkerContextCalls: [] as Record<string, unknown>[],
};

await mockModuleWithRestore("@/queue/createWorkerContext.js", () => ({
	createWorkerContext: async (args: Record<string, unknown>) => {
		mockState.createWorkerContextCalls.push(args);
		const logger = {
			child: mock(() => logger),
			error: mock(() => {}),
			info: mock(() => {}),
			debug: mock(() => {}),
		};
		return {
			logger,
			skipCache: args.skipCache ?? true,
			extraLogs: {},
		};
	},
}));

const { processMessage, shouldRetrySqsJobError } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/queue/processMessage.js?finalizeLockDispatch"
);

const finalizeParams = {
	lock_id: "lock_abc",
	action: "release",
	override_value: 0,
};

describe("processMessage finalize-lock jobs", () => {
	beforeEach(() => {
		mockState.createWorkerContextCalls = [];
	});

	// ── Contract: FinalizeLock jobs get a Redis-capable worker context ──────
	test("builds a worker context with skipCache false for FinalizeLock", async () => {
		const message = {
			MessageId: "msg_fin_123",
			Body: JSON.stringify({
				name: JobName.FinalizeLock,
				data: {
					orgId: "org_123",
					env: AppEnv.Sandbox,
					customerId: "cus_123",
					requestId: "req_fin_123",
					params: finalizeParams,
				},
			}),
		} satisfies Pick<Message, "MessageId" | "Body">;

		await processMessage({ message: message as Message, db: {} as never });

		expect(mockState.createWorkerContextCalls).toHaveLength(1);
		expect(mockState.createWorkerContextCalls[0]).toMatchObject({
			payload: expect.objectContaining({ requestId: "req_fin_123" }),
			skipCache: false,
		});
	});
});

describe("shouldRetrySqsJobError finalize-lock policy", () => {
	// ── Contract: transient infra errors stay in SQS for redelivery ─────────
	test("retries transient Redis and DB errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.FinalizeLock,
				error: new RedisUnavailableError({ source: "t", reason: "timeout" }),
			}),
		).toBe(true);
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.FinalizeLock,
				error: new Error("Connection terminated unexpectedly"),
			}),
		).toBe(true);
	});

	// ── Contract: claim-contested replays redeliver until the claim clears ──
	test("retries claim-contested finalize replays", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.FinalizeLock,
				error: new RecaseError({
					message: "Lock receipt not claimable: RESERVATION_ALREADY_PROCESSING",
					code: ErrCode.InvalidRequest,
					statusCode: 409,
					data: { blockingStatus: "RESERVATION_ALREADY_PROCESSING" },
				}),
			}),
		).toBe(true);
	});

	// ── Contract: application errors are not retried ────────────────────────
	test("does not retry application errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.FinalizeLock,
				error: new RecaseError({
					message: "Lock not found for ID: lock_abc",
					code: ErrCode.InvalidRequest,
				}),
			}),
		).toBe(false);
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.FinalizeLock,
				error: new Error("boom"),
			}),
		).toBe(false);
	});
});

afterAll(() => {
	mock.restore();
});
