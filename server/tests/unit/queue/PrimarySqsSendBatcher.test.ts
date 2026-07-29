/**
 * TDD contract for batching primary SQS queue sends.
 *
 * Contract under test:
 *   - up to 10 independent queue entries share one send-batch call
 *   - the tenth entry flushes immediately and a short window flushes partial batches
 *   - each caller resolves or rejects from its own SQS entry result
 *   - transport failures reject every caller in the affected batch
 *   - shutdown rejects new entries and drains pending plus in-flight sends
 *   - each entry preserves its job body, FIFO identifiers, and delay
 *   - the combined message bodies in one batch never exceed SQS's 1 MiB limit
 *
 * Pre-implementation red: PrimarySqsSendBatcher does not exist.
 * Post-implementation green: all batching and delivery assertions pass.
 */

import { describe, expect, test } from "bun:test";
import {
	PrimarySqsSendBatcher,
	type SendPrimarySqsBatchArgs,
} from "@/queue/PrimarySqsSendBatcher.js";

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

const createBatcher = ({
	sendBatch,
}: {
	sendBatch?: (args: SendPrimarySqsBatchArgs) => Promise<{
		failures: Array<{ index: number; reason: string }>;
	}>;
} = {}) => {
	const calls: SendPrimarySqsBatchArgs[] = [];
	const batcher = new PrimarySqsSendBatcher({
		batchWindowMs: BATCH_WINDOW_MS,
		sendBatch:
			sendBatch ??
			(async (args) => {
				calls.push(args);
				return { failures: [] };
			}),
	});

	return { batcher, calls };
};

describe("PrimarySqsSendBatcher", () => {
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
