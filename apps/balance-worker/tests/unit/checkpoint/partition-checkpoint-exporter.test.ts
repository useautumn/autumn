import { describe, expect, test } from "bun:test";
import { createPartitionCheckpoint } from "../../../src/checkpoint/partitionCheckpoint.js";
import { createPartitionCheckpointExporter } from "../../../src/checkpoint/partitionCheckpointExporter.js";

const topic = "metering-events-v1";
const partition = 2;
const createdAt = 1_700_000_000_000;
const limits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 1_000,
};

describe("partition checkpoint exporter", () => {
	test("stamps, captures, and publishes one checkpoint in order", async () => {
		const calls: string[] = [];
		const checkpoint = createPartitionCheckpoint({
			engineSchemaVersion: 1,
			createdAt,
			topic,
			partition,
			nextOffset: 42n,
			states: [],
			receipts: [],
		});
		const exporter = createPartitionCheckpointExporter({
			clock: {
				now: () => {
					calls.push("stamp");
					return createdAt;
				},
			},
			limits,
			stateStore: {
				capturePartitionCheckpoint: (params) => {
					calls.push("capture");
					expect(params).toEqual({
						topic,
						partition,
						createdAt,
						limits,
					});
					return checkpoint;
				},
			},
			publisher: {
				publish: async ({ checkpoint: publishedCheckpoint }) => {
					calls.push("publish");
					expect(publishedCheckpoint).toBe(checkpoint);
					return { kind: "published", etag: '"etag-42"' };
				},
			},
		});

		await expect(
			exporter.export({
				topic,
				partition,
				signal: new AbortController().signal,
			}),
		).resolves.toEqual({
			kind: "published",
			etag: '"etag-42"',
			createdAt,
			nextOffset: 42n,
			stateCount: 0,
			receiptCount: 0,
		});
		expect(calls).toEqual(["stamp", "capture", "publish"]);
	});

	test("does not capture after assignment cancellation", async () => {
		const abortController = new AbortController();
		const revoked = new Error("assignment revoked");
		abortController.abort(revoked);
		const exporter = createPartitionCheckpointExporter({
			clock: { now: () => createdAt },
			limits,
			stateStore: {
				capturePartitionCheckpoint: () => {
					throw new Error("capture should not run");
				},
			},
			publisher: {
				publish: async () => {
					throw new Error("publish should not run");
				},
			},
		});

		await expect(
			exporter.export({ topic, partition, signal: abortController.signal }),
		).rejects.toBe(revoked);
	});
});
