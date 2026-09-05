import { expect, test } from "bun:test";
import { KafkaPartitionOffsetsNotFoundError } from "../../../src/consumer/consumerErrors.js";
import {
	readPartitionLogRange,
	readTopicHighWatermarks,
} from "../../../src/consumer/partitionOffsets.js";

async function readsExactPartitionOffsets(): Promise<void> {
	async function fetchTopicOffsets(topic: string) {
		expect(topic).toBe("metering");
		return [
			{ partition: 0, low: "0", high: "7", offset: "7" },
			{
				partition: 2,
				low: "9007199254740993",
				high: "9007199254740999",
				offset: "9007199254740999",
			},
		];
	}
	const ctx = { partitionOffsets: { fetchTopicOffsets } };
	expect(
		await readPartitionLogRange({ ctx, topic: "metering", partition: 2 }),
	).toEqual({
		logStartOffset: 9007199254740993n,
		logEndOffset: 9007199254740999n,
	});
	await expect(
		readPartitionLogRange({ ctx, topic: "metering", partition: 1 }),
	).rejects.toBeInstanceOf(KafkaPartitionOffsetsNotFoundError);
}

test(
	"partition ranges preserve bigint precision and reject a missing partition",
	readsExactPartitionOffsets,
);

async function readsTopicSnapshot(): Promise<void> {
	let empty = false;
	let fetchCount = 0;
	async function fetchTopicOffsets(topic: string) {
		expect(topic).toBe("metering");
		fetchCount += 1;
		if (empty) return [];
		return [
			{ partition: 0, low: "0", high: "0", offset: "0" },
			{ partition: 2, low: "0", high: "9007199254740999", offset: "10" },
		];
	}
	const ctx = { partitionOffsets: { fetchTopicOffsets } };
	const highWatermarks = await readTopicHighWatermarks({
		ctx,
		topic: "metering",
	});
	expect(highWatermarks).toEqual(
		new Map([
			[0, 0n],
			[2, 9007199254740999n],
		]),
	);
	expect(highWatermarks.get(1)).toBeUndefined();
	expect(fetchCount).toBe(1);
	empty = true;
	expect(await readTopicHighWatermarks({ ctx, topic: "metering" })).toEqual(
		new Map(),
	);
	expect(fetchCount).toBe(2);
}

test(
	"topic snapshots preserve bigint high watermarks, missing partitions and empty topics",
	readsTopicSnapshot,
);
