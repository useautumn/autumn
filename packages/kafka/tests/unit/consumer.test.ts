import { describe, expect, test } from "bun:test";
import {
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import type {
	ConsumerEndBatchProcessEvent,
	ConsumerRunConfig,
	EachBatchPayload,
	KafkaMessage,
	OffsetsByTopicPartition,
} from "kafkajs";
import { createProgressTracker } from "../../src/consumer/createProgressTracker.js";
import { createTopicConsumer } from "../../src/consumer/createTopicConsumer.js";
import type {
	KafkaConsumerClient,
	TopicRecord,
	TopicRecordResult,
} from "../../src/consumer/types/consumer.js";
import { InvalidRecordError } from "../../src/lib/recordErrors.js";
import { createMeteringConsumer } from "../../src/topics/metering/consumer/createMeteringConsumer.js";
import type {
	MeteringRecordApplication,
	MeteringRecordFailure,
} from "../../src/topics/metering/consumer/types/meteringConsumer.js";
import { serializeMeteringRecord } from "../../src/topics/metering/meteringTopic.js";

const topic = "test-topic";

const partition = 2;

type ConsumerFixtureOptions = {
	commitGate?: Promise<void>;
	startupFailure?: Error;
	stopFailure?: Error;
	disconnectFailure?: Error;
};

function createConsumerFixture(options: ConsumerFixtureOptions = {}) {
	const events: string[] = [];
	const commits: Array<
		Array<{ topic: string; partition: number; offset: string }>
	> = [];
	const seeks: Array<{ topic: string; partition: number; offset: string }> = [];
	const listeners = new Map<string, unknown>();
	let runConfig: ConsumerRunConfig | undefined;
	let commitFailure: Error | undefined;

	async function connect(): Promise<void> {
		events.push("connect");
	}
	async function subscribe(): Promise<void> {
		events.push("subscribe");
	}
	async function run(config: ConsumerRunConfig = {}): Promise<void> {
		events.push("run");
		runConfig = config;
		if (options.startupFailure) throw options.startupFailure;
	}
	async function stop(): Promise<void> {
		events.push("stop");
		if (options.stopFailure) throw options.stopFailure;
	}
	async function disconnect(): Promise<void> {
		events.push("disconnect");
		if (options.disconnectFailure) throw options.disconnectFailure;
	}
	async function commitOffsets(
		offsets: Array<{ topic: string; partition: number; offset: string }>,
	): Promise<void> {
		events.push("commit");
		if (commitFailure) {
			const cause = commitFailure;
			commitFailure = undefined;
			throw cause;
		}
		await options.commitGate;
		commits.push(offsets);
	}
	function seek(position: {
		topic: string;
		partition: number;
		offset: string;
	}): void {
		events.push("seek");
		seeks.push(position);
	}
	function pause(): void {
		events.push("pause");
	}
	function resume(): void {
		events.push("resume");
	}
	function on(event: string, listener: unknown): () => void {
		listeners.set(event, listener);
		function unsubscribe(): void {
			listeners.delete(event);
		}
		return unsubscribe;
	}
	const consumer: KafkaConsumerClient = {
		connect,
		subscribe,
		run,
		stop,
		disconnect,
		commitOffsets,
		seek,
		pause,
		resume,
		on: on as KafkaConsumerClient["on"],
		events: {
			GROUP_JOIN: "consumer.group_join",
			END_BATCH_PROCESS: "consumer.end_batch_process",
		} as KafkaConsumerClient["events"],
	};

	async function deliverBatch({
		records,
		lastOffset: fetchedLastOffset,
		uncommittedPartition = partition,
	}: {
		records: Array<{
			offset: string;
			key: Buffer | null;
			value: Buffer | null;
		}>;
		lastOffset?: string;
		uncommittedPartition?: number | string;
	}): Promise<void> {
		if (!runConfig?.eachBatch) throw new Error("Consumer has not started");
		let resolvedOffset: string | undefined;
		const messages: KafkaMessage[] = [];
		for (const record of records)
			messages.push({ ...record, timestamp: "0", attributes: 0, headers: {} });
		function firstOffset(): string | null {
			return messages[0]?.offset ?? null;
		}
		function lastOffset(): string {
			return fetchedLastOffset ?? messages.at(-1)?.offset ?? "0";
		}
		function isEmpty(): boolean {
			return messages.length === 0;
		}
		function offsetLag(): string {
			return "0";
		}
		function resolveOffset(offset: string): void {
			events.push(`resolve:${offset}`);
			resolvedOffset = offset;
		}
		async function heartbeat(): Promise<void> {
			events.push("heartbeat");
		}
		function resumeBatch(): void {}
		function pauseBatch(): () => void {
			return resumeBatch;
		}
		function uncommittedOffsets(): OffsetsByTopicPartition {
			if (resolvedOffset === undefined) return { topics: [] };
			return {
				topics: [
					{
						topic,
						partitions: [
							{
								partition: uncommittedPartition as number,
								offset: (BigInt(resolvedOffset) + 1n).toString(),
							},
						],
					},
				],
			};
		}
		async function commitOffsetsIfNecessary(
			offsets?: OffsetsByTopicPartition,
		): Promise<void> {
			const pending = offsets ?? uncommittedOffsets();
			const positions: Array<{
				topic: string;
				partition: number;
				offset: string;
			}> = [];
			for (const entry of pending.topics) {
				for (const position of entry.partitions)
					positions.push({
						topic: entry.topic,
						partition: position.partition,
						offset: position.offset,
					});
			}
			await commitOffsets(positions);
		}
		function isRunning(): boolean {
			return true;
		}
		function isStale(): boolean {
			return false;
		}
		const payload: EachBatchPayload = {
			batch: {
				topic,
				partition,
				highWatermark: "100",
				messages,
				firstOffset,
				lastOffset,
				isEmpty,
				offsetLag,
				offsetLagLow: offsetLag,
			},
			resolveOffset,
			heartbeat,
			pause: pauseBatch,
			uncommittedOffsets,
			commitOffsetsIfNecessary,
			isRunning,
			isStale,
		};
		await runConfig.eachBatch(payload);
	}

	function emitGroupJoin(): void {
		const listener = listeners.get("consumer.group_join") as
			| (() => void)
			| undefined;
		listener?.();
	}
	function emitBatchProcessed({
		batchSize,
		lastOffset,
		eventTopic = topic,
	}: {
		batchSize: number;
		lastOffset: string;
		eventTopic?: string;
	}): void {
		const listener = listeners.get("consumer.end_batch_process") as
			| ((event: ConsumerEndBatchProcessEvent) => void)
			| undefined;
		listener?.({
			id: "event",
			type: "consumer.end_batch_process",
			timestamp: 0,
			payload: {
				topic: eventTopic,
				partition,
				highWatermark: (BigInt(lastOffset) + 1n).toString(),
				offsetLag: "0",
				offsetLagLow: "0",
				batchSize,
				firstOffset: lastOffset,
				lastOffset,
				duration: 1,
			},
		});
	}
	function failNextCommit(cause: Error): void {
		commitFailure = cause;
	}
	function readRunConfig(): ConsumerRunConfig | undefined {
		return runConfig;
	}
	return {
		consumer,
		events,
		commits,
		seeks,
		listeners,
		deliverBatch,
		emitGroupJoin,
		emitBatchProcessed,
		failNextCommit,
		readRunConfig,
	};
}

function createRecord(offset: string) {
	return { offset, key: Buffer.from("key"), value: Buffer.from("value") };
}

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

function topicConsumerTests(): void {
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
}

function createMeteringRecords() {
	const identity = {
		orgId: "org_1",
		env: "sandbox",
		customerId: "cus_1",
	} as const;
	const state = createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "balance", balance: 10, usage: 0 }],
			},
		},
	});
	const command = parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId: "command",
			requestId: "request",
			identity,
			entityId: null,
			featureId: "messages",
			value: 5,
			overageBehavior: "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});
	const decision = computeTrack({
		state,
		command,
	});
	if (decision.kind !== "new") throw new Error("Expected a new outcome");
	return { outcome: decision.outcome };
}

async function deliversTypedRecordsWithoutChangingOffsets(): Promise<void> {
	const fixture = createConsumerFixture();
	const records = createMeteringRecords();
	const applications: MeteringRecordApplication[] = [];
	function applyRecord(application: MeteringRecordApplication): void {
		applications.push(application);
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await consumer.start();
	await fixture.deliverBatch({
		records: [
			{
				offset: "0",
				...serializeMeteringRecord({ record: records.outcome }),
			},
			{ offset: "1", ...serializeMeteringRecord({ record: records.outcome }) },
		],
	});
	expect(applications).toEqual([
		{
			position: { topic, partition, offset: 0n },
			record: records.outcome,
		},
		{ position: { topic, partition, offset: 1n }, record: records.outcome },
	]);
	expect(fixture.commits).toEqual([[{ topic, partition, offset: "2" }]]);
	await consumer.stop();
}

async function reportsCodecFailureThroughApplicationBoundary(): Promise<void> {
	const fixture = createConsumerFixture();
	const progress = createProgressTracker();
	let failure: MeteringRecordFailure | undefined;
	const mapped = new Error("record invariant failed");
	function applyRecord(): never {
		throw new Error("Malformed record reached application");
	}
	function onRecordError(input: MeteringRecordFailure): never {
		failure = input;
		throw mapped;
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord, onRecordError },
			progress,
		},
		config: { topic },
	});
	await consumer.start();
	await expect(
		fixture.deliverBatch({ records: [createRecord("0")] }),
	).rejects.toBe(mapped);
	expect(failure).toMatchObject({ topic, partition, offset: "0" });
	expect(failure?.cause).toBeInstanceOf(InvalidRecordError);
	expect(fixture.commits).toEqual([]);
	expect(progress.read({ topic, partition })).toBeNull();
	await consumer.stop();
}

async function preservesUnmappedAndAsynchronousFailures(): Promise<void> {
	const raw = createConsumerFixture();
	function applyRecord(): undefined {
		return undefined;
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: raw.consumer,
			handler: { readResumeOffset, applyRecord },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await consumer.start();
	await expect(
		raw.deliverBatch({ records: [createRecord("0")] }),
	).rejects.toBeInstanceOf(InvalidRecordError);
	await consumer.stop();

	const asynchronous = createConsumerFixture();
	const cause = new Error("store failed");
	const mapped = new Error("application failed", { cause });
	async function rejectApplication(): Promise<undefined> {
		throw cause;
	}
	function onRecordError(failure: MeteringRecordFailure): never {
		expect(failure.cause).toBe(cause);
		throw mapped;
	}
	const next = createMeteringConsumer({
		ctx: {
			consumer: asynchronous.consumer,
			handler: {
				readResumeOffset,
				applyRecord: rejectApplication,
				onRecordError,
			},
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await next.start();
	await expect(
		asynchronous.deliverBatch({
			records: [
				{
					offset: "0",
					...serializeMeteringRecord({
						record: createMeteringRecords().outcome,
					}),
				},
			],
		}),
	).rejects.toBe(mapped);
	expect(asynchronous.commits).toEqual([]);
	await next.stop();
}

function meteringConsumerTests(): void {
	test(
		"metering consumer applies engine-parsed outcomes in order",
		deliversTypedRecordsWithoutChangingOffsets,
	);
	test(
		"metering consumer delegates codec error policy without committing",
		reportsCodecFailureThroughApplicationBoundary,
	);
	test(
		"metering consumer preserves raw errors and maps asynchronous handler failure",
		preservesUnmappedAndAsynchronousFailures,
	);
}

describe("topicConsumer", topicConsumerTests);
describe("meteringConsumer", meteringConsumerTests);
