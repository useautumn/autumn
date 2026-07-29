/**
 * TDD contract for batching async-track SQS sends without changing the worker
 * payload or combining multiple track events into one SQS message.
 *
 * Contract under test:
 *   New behavior:
 *     - up to 10 independent track messages share one SendMessageBatch call
 *     - the tenth entry flushes immediately
 *     - a short window flushes partial batches
 *     - each caller awaits and receives its own SQS entry result
 *     - partial failures reject only the corresponding callers
 *     - shutdown rejects new entries and drains pending plus in-flight sends
 *   Preserved behavior:
 *     - every SQS entry contains exactly one legacy track payload
 *     - message group and deduplication IDs remain per event
 *
 * Pre-implementation red: AsyncTrackSqsBatcher does not exist.
 * Post-implementation green: all producer batching and delivery assertions pass.
 */

import { describe, expect, test } from "bun:test";
import { ApiVersion, AppEnv } from "@autumn/shared";
import {
	AsyncTrackSqsBatcher,
	type SendAsyncTrackBatchArgs,
} from "@/internal/balances/track/AsyncTrackSqsBatcher.js";

const QUEUE_URL =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async.fifo";
const BATCH_WINDOW_MS = 10;

const createEntry = ({ index }: { index: number }) => ({
	queueUrl: QUEUE_URL,
	payload: {
		orgId: "org_1",
		env: AppEnv.Live,
		customerId: `customer_${index}`,
		requestId: `request_${index}`,
		apiVersion: ApiVersion.V2_1,
		body: {
			customer_id: `customer_${index}`,
			feature_id: "messages",
			value: index + 1,
		},
	},
	messageGroupId: `org_1:live:customer_${index}:none:shard-0`,
	messageDeduplicationId: `request_${index}`,
});

const createBatcher = ({
	sendBatch,
}: {
	sendBatch?: (args: SendAsyncTrackBatchArgs) => Promise<{
		successCount: number;
		failures: Array<{ index: number; reason: string }>;
	}>;
} = {}) => {
	const calls: SendAsyncTrackBatchArgs[] = [];
	const batcher = new AsyncTrackSqsBatcher({
		batchWindowMs: BATCH_WINDOW_MS,
		sendBatch:
			sendBatch ??
			(async (args) => {
				calls.push(args);
				return { successCount: args.entries.length, failures: [] };
			}),
	});

	return { batcher, calls };
};

describe("AsyncTrackSqsBatcher", () => {
	test("flushes 10 independent SQS messages in one batch call", async () => {
		const { batcher, calls } = createBatcher();

		await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				batcher.enqueue(createEntry({ index })),
			),
		);

		expect(calls).toHaveLength(1);
		expect(calls[0].entries).toHaveLength(10);
		expect(calls[0].entries[0]).toMatchObject({
			messageDeduplicationId: "request_0",
			payload: {
				customerId: "customer_0",
				body: {
					customer_id: "customer_0",
					value: 1,
				},
			},
		});
		expect(calls[0].entries[9].messageDeduplicationId).toBe("request_9");
	});

	test("flushes a partial batch after the short batching window", async () => {
		const { batcher, calls } = createBatcher();

		await batcher.enqueue(createEntry({ index: 0 }));

		expect(calls).toHaveLength(1);
		expect(calls[0].entries).toHaveLength(1);
	});

	test("rejects only callers whose SQS entries failed", async () => {
		const calls: SendAsyncTrackBatchArgs[] = [];
		const { batcher } = createBatcher({
			sendBatch: async (args) => {
				calls.push(args);
				return {
					successCount: 2,
					failures: [{ index: 1, reason: "SQS throttled entry 1" }],
				};
			},
		});
		const resultsPromise = Promise.allSettled(
			Array.from({ length: 3 }, (_, index) =>
				batcher.enqueue(createEntry({ index })),
			),
		);

		await batcher.flush();
		const results = await resultsPromise;

		expect(calls).toHaveLength(1);
		expect(results.map((result) => result.status)).toEqual([
			"fulfilled",
			"rejected",
			"fulfilled",
		]);
		expect(results[1]).toMatchObject({
			status: "rejected",
			reason: expect.objectContaining({
				message: "SQS throttled entry 1",
			}),
		});
	});

	test("shutdown drains pending and in-flight sends before resolving", async () => {
		let resolveSend:
			| ((result: {
					successCount: number;
					failures: Array<{ index: number; reason: string }>;
			  }) => void)
			| undefined;
		const { batcher } = createBatcher({
			sendBatch: () =>
				new Promise((resolve) => {
					resolveSend = resolve;
				}),
		});
		const queued = batcher.enqueue(createEntry({ index: 0 }));
		let shutdownResolved = false;

		const shutdown = batcher.shutdown().then(() => {
			shutdownResolved = true;
		});
		await Promise.resolve();

		expect(shutdownResolved).toBeFalse();
		await expect(batcher.enqueue(createEntry({ index: 1 }))).rejects.toThrow(
			"shutting down",
		);

		resolveSend?.({ successCount: 1, failures: [] });
		await Promise.all([queued, shutdown]);

		expect(shutdownResolved).toBeTrue();
	});
});
