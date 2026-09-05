import { describe, expect, test } from "bun:test";
import { KafkaPartitionOffsetsNotFoundError } from "../../src/consumer/consumerErrors.js";
import { createProgressTracker } from "../../src/consumer/createProgressTracker.js";
import {
	readPartitionLogRange,
	readTopicHighWatermarks,
} from "../../src/consumer/partitionOffsets.js";

const topic = "metering-events-v1";

const partition = 2;

async function waitsForTargetPosition(): Promise<void> {
	const tracker = createProgressTracker();
	let caughtUp = false;
	async function catchUpToTarget(): Promise<void> {
		await tracker.waitUntil({ topic, partition, nextOffset: 5n });
		caughtUp = true;
	}
	const catchUp = catchUpToTarget();

	tracker.advance({ topic, partition, nextOffset: 3n });
	await Promise.resolve();
	expect(caughtUp).toBe(false);

	tracker.advance({ topic, partition, nextOffset: 5n });
	await catchUp;

	expect(caughtUp).toBe(true);
	expect(tracker.read({ topic, partition })).toBe(5n);
}

function neverMovesConsumedPositionBackwards(): void {
	const tracker = createProgressTracker();

	tracker.advance({ topic, partition, nextOffset: 8n });
	tracker.advance({ topic, partition, nextOffset: 3n });

	expect(tracker.read({ topic, partition })).toBe(8n);
}

function tracksPositionAndHighWatermark(): void {
	const tracker = createProgressTracker();

	tracker.advance({ topic, partition, nextOffset: 8n });
	tracker.observeHighWatermark({ topic, partition, highWatermark: 12n });

	expect(tracker.readProgress({ topic, partition })).toEqual({
		consumedNextOffset: 8n,
		highWatermark: 12n,
	});
}

function neverMovesHighWatermarkBackwards(): void {
	const tracker = createProgressTracker();

	tracker.observeHighWatermark({ topic, partition, highWatermark: 12n });
	tracker.observeHighWatermark({ topic, partition, highWatermark: 9n });

	expect(tracker.readProgress({ topic, partition }).highWatermark).toBe(12n);
}

async function cancelsPendingWait(): Promise<void> {
	const tracker = createProgressTracker();
	const controller = new AbortController();
	const stopped = new Error("partition stopped");
	const catchUp = tracker.waitUntil({
		topic,
		partition,
		nextOffset: 5n,
		signal: controller.signal,
	});

	controller.abort(stopped);

	await expect(catchUp).rejects.toBe(stopped);
	expect(tracker.read({ topic, partition })).toBeNull();
}

function progressTrackerTests(): void {
	test(
		"resolves catch-up only after the consumed position reaches the target",
		waitsForTargetPosition,
	);
	test(
		"never moves a consumed position backwards",
		neverMovesConsumedPositionBackwards,
	);
	test(
		"tracks consumed position and the latest observed high watermark",
		tracksPositionAndHighWatermark,
	);
	test(
		"never moves an observed high watermark backwards",
		neverMovesHighWatermarkBackwards,
	);
	test("cancels a pending catch-up wait", cancelsPendingWait);
}

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

function partitionOffsetTests(): void {
	test(
		"partition ranges preserve bigint precision and reject a missing partition",
		readsExactPartitionOffsets,
	);
	test(
		"topic snapshots preserve bigint high watermarks, missing partitions and empty topics",
		readsTopicSnapshot,
	);
}

describe("progressTracker", progressTrackerTests);
describe("partitionOffset", partitionOffsetTests);
