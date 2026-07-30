/**
 * Contract for accumulating independent SQS sends into bounded batches.
 *
 * Contract under test:
 *   - up to 10 independent queue entries share one send-batch call
 *   - the tenth entry flushes immediately and a short window flushes partial batches
 *   - each caller resolves or rejects from its own SQS entry result
 *   - transport failures reject every caller in the affected batch
 *   - at most 10 batch requests are in flight at once
 *   - saturated batches reject immediately and capacity returns after sends settle
 *   - shutdown rejects new entries and drains pending plus in-flight sends
 *   - each entry preserves its job body, FIFO identifiers, and delay
 *   - the combined message bodies in one batch never exceed SQS's 1 MiB limit
 *
 * The generic accumulator owns timing, bounds, per-entry results, and shutdown;
 * queue-specific code supplies the entry shape and batch sender.
 */

import { describe, expect, test } from "bun:test";
import {
	type SendSqsAccumulatorBatchArgs,
	SqsBatchAccumulator,
} from "@/queue/SqsBatchAccumulator.js";

const QUEUE_URL =
	"https://sqs.us-east-2.amazonaws.com/123456789012/autumn-prod.fifo";
const BATCH_WINDOW_MS = 10;

const createEntry = ({ index }: { index: number }) => ({
	queueUrl: QUEUE_URL,
	jobName: index % 2 === 0 ? "sync-customer-dirty" : "insert-event-batch",
	messageBody: JSON.stringify({
		id: `job_${index}`,
		name: index % 2 === 0 ? "sync-customer-dirty" : "insert-event-batch",
		data: { index },
	}),
	messageGroupId: `customer_${index % 3}`,
	messageDeduplicationId: `dedup_${index}`,
	delaySeconds: index === 0 ? 2 : undefined,
});

type TestEntry = ReturnType<typeof createEntry>;

const createBatcher = ({
	maxBatchEntries,
	sendBatch,
}: {
	maxBatchEntries?: number;
	sendBatch?: (args: SendSqsAccumulatorBatchArgs<TestEntry>) => Promise<{
		failures: Array<{ index: number; reason: string }>;
	}>;
} = {}) => {
	const calls: SendSqsAccumulatorBatchArgs<TestEntry>[] = [];
	const batcher = new SqsBatchAccumulator<TestEntry>({
		batchWindowMs: BATCH_WINDOW_MS,
		maxBatchEntries,
		sendBatch: async (args) => {
			calls.push(args);
			return sendBatch ? sendBatch(args) : { failures: [] };
		},
	});

	return { batcher, calls };
};

describe("SqsBatchAccumulator", () => {
	test("flushes 10 independent entries in one batch call", async () => {
		const { batcher, calls } = createBatcher();

		await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				batcher.enqueue(createEntry({ index })),
			),
		);

		expect(calls).toHaveLength(1);
		expect(calls[0].entries).toEqual(
			Array.from({ length: 10 }, (_, index) => createEntry({ index })),
		);
	});

	test("flushes a partial batch after the batching window", async () => {
		const { batcher, calls } = createBatcher();

		await Promise.all(
			Array.from({ length: 3 }, (_, index) =>
				batcher.enqueue(createEntry({ index })),
			),
		);

		expect(calls).toHaveLength(1);
		expect(calls[0].entries).toHaveLength(3);
	});

	test("splits entries before their combined message bodies exceed 1 MiB", async () => {
		const { batcher, calls } = createBatcher();
		const largeBody = "x".repeat(600 * 1024);

		await Promise.all([
			batcher.enqueue({
				...createEntry({ index: 0 }),
				messageBody: largeBody,
			}),
			batcher.enqueue({
				...createEntry({ index: 1 }),
				messageBody: largeBody,
			}),
		]);

		expect(calls).toHaveLength(2);
		expect(calls.map(({ entries }) => entries.length)).toEqual([1, 1]);
	});

	test("rejects only callers whose SQS entries failed", async () => {
		const { batcher } = createBatcher({
			sendBatch: async () => ({
				failures: [{ index: 1, reason: "SQS throttled entry 1" }],
			}),
		});
		const resultsPromise = Promise.allSettled(
			Array.from({ length: 3 }, (_, index) =>
				batcher.enqueue(createEntry({ index })),
			),
		);

		await batcher.flush();
		const results = await resultsPromise;

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

	test("rejects every caller when the batch transport fails", async () => {
		const { batcher } = createBatcher({
			sendBatch: async () => {
				throw new Error("SQS unavailable");
			},
		});
		const resultsPromise = Promise.allSettled(
			Array.from({ length: 2 }, (_, index) =>
				batcher.enqueue(createEntry({ index })),
			),
		);

		await batcher.flush();
		const results = await resultsPromise;

		expect(results).toHaveLength(2);
		for (const result of results) {
			expect(result).toMatchObject({
				status: "rejected",
				reason: expect.objectContaining({ message: "SQS unavailable" }),
			});
		}
	});

	test("rejects batches above the in-flight send limit", async () => {
		const sendResolvers: Array<
			(result: { failures: Array<{ index: number; reason: string }> }) => void
		> = [];
		const { batcher, calls } = createBatcher({
			maxBatchEntries: 1,
			sendBatch: () =>
				new Promise((resolve) => {
					sendResolvers.push(resolve);
				}),
		});

		const accepted = Array.from({ length: 10 }, (_, index) =>
			batcher.enqueue(createEntry({ index })),
		);
		const saturated = batcher.enqueue(createEntry({ index: 10 }));

		expect(calls).toHaveLength(10);
		await expect(saturated).rejects.toThrow(
			"SQS batch accumulator is saturated",
		);

		for (const resolveSend of sendResolvers) {
			resolveSend({ failures: [] });
		}
		await Promise.all(accepted);
	});

	test("accepts another batch after an in-flight send settles", async () => {
		const sendResolvers: Array<
			(result: { failures: Array<{ index: number; reason: string }> }) => void
		> = [];
		const { batcher, calls } = createBatcher({
			maxBatchEntries: 1,
			sendBatch: () =>
				new Promise((resolve) => {
					sendResolvers.push(resolve);
				}),
		});

		const accepted = Array.from({ length: 10 }, (_, index) =>
			batcher.enqueue(createEntry({ index })),
		);
		await expect(batcher.enqueue(createEntry({ index: 10 }))).rejects.toThrow(
			"SQS batch accumulator is saturated",
		);

		sendResolvers[0]?.({ failures: [] });
		await accepted[0];

		const afterRecovery = batcher.enqueue(createEntry({ index: 11 }));
		expect(calls).toHaveLength(11);

		for (const resolveSend of sendResolvers.slice(1)) {
			resolveSend({ failures: [] });
		}
		await Promise.all([...accepted.slice(1), afterRecovery]);
	});

	test("shutdown drains pending and in-flight sends before resolving", async () => {
		let resolveSend:
			| ((result: {
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

		resolveSend?.({ failures: [] });
		await Promise.all([queued, shutdown]);

		expect(shutdownResolved).toBeTrue();
	});
});
