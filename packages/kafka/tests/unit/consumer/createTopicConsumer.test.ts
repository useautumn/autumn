import { expect, test } from "bun:test";
import { createProgressTracker } from "../../../src/consumer/createProgressTracker.js";
import { createTopicConsumer } from "../../../src/consumer/createTopicConsumer.js";
import type {
	TopicRecord,
	TopicRecordResult,
} from "../../../src/consumer/types/consumer.js";
import {
	createConsumerFixture,
	createRecord,
	partition,
	topic,
} from "./consumerTestFixtures.js";

function readResumeOffset(): null {
	return null;
}
function applyRecord(): undefined {
	return undefined;
}

async function commitsOnlyAfterApplyingWholeBatch(): Promise<void> {
	const gate = Promise.withResolvers<void>();
	const fixture = createConsumerFixture({ commitGate: gate.promise });
	const progress = createProgressTracker();
	function applyRecord({ message }: TopicRecord): undefined {
		fixture.events.push(`apply:${message.offset}`);
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress,
		},
		config: { topic, partitionsConsumedConcurrently: 3 },
	});
	await consumer.start();
	const delivery = fixture.deliverBatch({
		records: [createRecord("0"), createRecord("2")],
		lastOffset: "4",
		uncommittedPartition: "2",
	});
	expect(fixture.events.slice(3)).toEqual([
		"apply:0",
		"resolve:0",
		"heartbeat",
	]);
	await Bun.sleep(0);
	expect(fixture.events.slice(3)).toEqual([
		"apply:0",
		"resolve:0",
		"heartbeat",
		"apply:2",
		"resolve:2",
		"heartbeat",
		"commit",
	]);
	expect(progress.read({ topic, partition })).toBeNull();
	gate.resolve();
	await delivery;
	expect(fixture.commits).toEqual([[{ topic, partition, offset: "3" }]]);
	expect(progress.read({ topic, partition })).toBe(5n);
	expect(fixture.readRunConfig()).toMatchObject({
		autoCommit: false,
		eachBatchAutoResolve: false,
		partitionsConsumedConcurrently: 3,
	});
	await consumer.stop();
}

async function reconcilesInitialOffsetAndRejoins(): Promise<void> {
	const fixture = createConsumerFixture();
	const progress = createProgressTracker();
	let resumes = 0;
	let applications = 0;
	function readResumeOffset(): bigint {
		resumes++;
		return 1n;
	}
	function applyRecord(): undefined {
		applications++;
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress,
		},
		config: { topic },
	});
	await consumer.start();
	fixture.failNextCommit(new Error("commit failed"));
	await expect(
		fixture.deliverBatch({ records: [createRecord("3")] }),
	).rejects.toThrow("commit failed");
	expect(fixture.seeks).toEqual([]);
	expect(progress.read({ topic, partition })).toBeNull();
	await fixture.deliverBatch({ records: [createRecord("3")] });
	expect(fixture.seeks).toEqual([{ topic, partition, offset: "1" }]);
	expect(applications).toBe(0);
	await fixture.deliverBatch({ records: [createRecord("1")] });
	expect(applications).toBe(1);
	expect(resumes).toBe(2);
	fixture.emitGroupJoin();
	await fixture.deliverBatch({ records: [createRecord("3")] });
	expect(resumes).toBe(3);
	expect(fixture.seeks).toHaveLength(2);
	await consumer.stop();
}

async function reconcilesAdvancedApplicationOffset(): Promise<void> {
	const fixture = createConsumerFixture();
	const progress = createProgressTracker();
	let applications = 0;
	function applyRecord(): TopicRecordResult {
		applications++;
		return { nextOffset: 9n };
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress,
		},
		config: { topic },
	});
	await consumer.start();
	await fixture.deliverBatch({
		records: [createRecord("0"), createRecord("1")],
	});
	expect(applications).toBe(1);
	expect(fixture.commits).toEqual([[{ topic, partition, offset: "9" }]]);
	expect(fixture.seeks).toEqual([{ topic, partition, offset: "9" }]);
	expect(progress.read({ topic, partition })).toBe(9n);
	await consumer.stop();
}

async function withdrawalSettlesPendingResume(): Promise<void> {
	const fixture = createConsumerFixture();
	const progress = createProgressTracker();
	const gate = Promise.withResolvers<bigint | null>();
	function readResumeOffset(): Promise<bigint | null> {
		return gate.promise;
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress,
		},
		config: { topic },
	});
	await consumer.start();
	const delivery = fixture.deliverBatch({ records: [createRecord("2")] });
	const withdrawal = consumer.withdrawPartition({ partition });
	expect(await Promise.race([withdrawal, Promise.resolve("pending")])).toBe(
		"pending",
	);
	gate.resolve(0n);
	await delivery;
	await withdrawal;
	expect(fixture.seeks).toEqual([]);
	expect(fixture.commits).toEqual([]);
	expect(progress.read({ topic, partition })).toBeNull();
	fixture.emitBatchProcessed({ batchSize: 0, lastOffset: "8" });
	expect(progress.read({ topic, partition })).toBeNull();
	consumer.resumePartition({ partition });
	await fixture.deliverBatch({ records: [createRecord("2")] });
	expect(fixture.seeks).toEqual([{ topic, partition, offset: "0" }]);
	await consumer.stop();
}

async function withdrawalInvalidatesPendingApplication(): Promise<void> {
	const fixture = createConsumerFixture();
	const progress = createProgressTracker();
	const gate = Promise.withResolvers<TopicRecordResult>();
	function applyRecord(): Promise<TopicRecordResult> {
		return gate.promise;
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress,
		},
		config: { topic },
	});
	await consumer.start();
	const delivery = fixture.deliverBatch({ records: [createRecord("0")] });
	const withdrawal = consumer.withdrawPartition({ partition });
	gate.resolve(undefined);
	await delivery;
	await withdrawal;
	expect(fixture.events).not.toContain("resolve:0");
	expect(fixture.commits).toEqual([]);
	expect(progress.read({ topic, partition })).toBeNull();
	await consumer.stop();
}

async function markerProgressAndFetchingControls(): Promise<void> {
	const fixture = createConsumerFixture();
	const progress = createProgressTracker();
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress,
		},
		config: { topic },
	});
	await consumer.start();
	fixture.emitBatchProcessed({ batchSize: 0, lastOffset: "4" });
	expect(progress.readProgress({ topic, partition })).toEqual({
		consumedNextOffset: 5n,
		highWatermark: 5n,
	});
	fixture.emitBatchProcessed({ batchSize: 1, lastOffset: "8" });
	expect(progress.read({ topic, partition })).toBe(5n);
	fixture.emitBatchProcessed({
		batchSize: 0,
		lastOffset: "20",
		eventTopic: "other",
	});
	expect(progress.read({ topic, partition })).toBe(5n);
	consumer.seekPartition({ partition, nextOffset: 3n });
	consumer.pausePartition({ partition });
	consumer.resumeFetching({ partition });
	expect(fixture.seeks).toEqual([{ topic, partition, offset: "3" }]);
	expect(fixture.events.slice(-3)).toEqual(["seek", "pause", "resume"]);
	expect(consumer.progress).toBe(progress);
	await consumer.stop();
}

async function lifecycleFailuresRemoveListeners(): Promise<void> {
	const failure = new Error("startup failed");
	const startup = createConsumerFixture({
		startupFailure: failure,
		disconnectFailure: new Error("disconnect failed"),
	});
	const first = createTopicConsumer({
		ctx: {
			consumer: startup.consumer,
			handler: { readResumeOffset, applyRecord },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await expect(first.start()).rejects.toBe(failure);
	expect(startup.listeners.size).toBe(0);
	expect(startup.events).toEqual(["connect", "subscribe", "run", "disconnect"]);
	const stopFailure = new Error("stop failed");
	const shutdown = createConsumerFixture({ stopFailure });
	const second = createTopicConsumer({
		ctx: {
			consumer: shutdown.consumer,
			handler: { readResumeOffset, applyRecord },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await second.start();
	await expect(second.stop()).rejects.toBe(stopFailure);
	expect(shutdown.listeners.size).toBe(0);
	expect(shutdown.events).toEqual([
		"connect",
		"subscribe",
		"run",
		"stop",
		"disconnect",
	]);
	await second.stop();
	expect(shutdown.events).toHaveLength(5);
}

test(
	"applies all records before committing offsets and publishing progress",
	commitsOnlyAfterApplyingWholeBatch,
);
test(
	"reconciles initial offsets only after successful commits and resets on group join",
	reconcilesInitialOffsetAndRejoins,
);
test(
	"seeks beyond already applied records without folding the rest of the batch",
	reconcilesAdvancedApplicationOffset,
);
test(
	"withdrawal settles pending offset reads without publishing stale progress",
	withdrawalSettlesPendingResume,
);
test(
	"withdrawal invalidates asynchronous application completion",
	withdrawalInvalidatesPendingApplication,
);
test(
	"marker-only batches advance progress and partition controls target one topic",
	markerProgressAndFetchingControls,
);
test(
	"lifecycle failures preserve cleanup ordering and remove listeners",
	lifecycleFailuresRemoveListeners,
);
