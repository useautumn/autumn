import { describe, expect, test } from "bun:test";
import { createPartitionCheckpoint } from "../../../src/checkpoint/partitionCheckpoint.js";
import {
	decodePartitionCheckpoint,
	encodePartitionCheckpoint,
	PartitionCheckpointBodyLimitExceededError,
} from "../../../src/checkpoint/partitionCheckpointEncoding.js";

const checkpoint = createPartitionCheckpoint({
	engineSchemaVersion: 1,
	createdAt: 1_700_000_000_000,
	topic: "metering-events-v1",
	partition: 0,
	nextOffset: 42n,
	states: [],
	receipts: [],
});

const limits = {
	maxCompressedBytes: 1_000_000,
	maxSerializedBytes: 1_000_000,
};

describe("partition checkpoint encoding", () => {
	test("round-trips the canonical checkpoint through gzip", async () => {
		const encoded = await encodePartitionCheckpoint({ checkpoint, limits });

		expect(Array.from(encoded.body.slice(0, 2))).toEqual([0x1f, 0x8b]);
		expect(encoded.serializedBytes).toBeGreaterThan(encoded.compressedBytes);
		await expect(
			decodePartitionCheckpoint({ body: encoded.body, limits }),
		).resolves.toEqual(checkpoint);
	});

	test("rejects an oversized serialized checkpoint before compression", async () => {
		await expect(
			encodePartitionCheckpoint({
				checkpoint,
				limits: { ...limits, maxSerializedBytes: 10 },
			}),
		).rejects.toMatchObject({ limitName: "serialized_bytes" });
	});

	test("rejects oversized compressed and decompressed bodies", async () => {
		const encoded = await encodePartitionCheckpoint({ checkpoint, limits });

		await expect(
			decodePartitionCheckpoint({
				body: encoded.body,
				limits: {
					...limits,
					maxCompressedBytes: encoded.compressedBytes - 1,
				},
			}),
		).rejects.toBeInstanceOf(PartitionCheckpointBodyLimitExceededError);
		await expect(
			decodePartitionCheckpoint({
				body: encoded.body,
				limits: { ...limits, maxSerializedBytes: 10 },
			}),
		).rejects.toMatchObject({ limitName: "serialized_bytes" });
	});
});
