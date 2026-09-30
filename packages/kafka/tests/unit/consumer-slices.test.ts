import { expect, test } from "bun:test";
import type {
	ConsumerRunConfig,
	EachBatchPayload,
	IHeaders,
	KafkaMessage,
} from "kafkajs";
import { createProgressTracker } from "../../src/consumer/createProgressTracker.js";
import { createTopicConsumer } from "../../src/consumer/createTopicConsumer.js";
import type {
	KafkaConsumerClient,
	TopicRecordSlice,
} from "../../src/consumer/types/consumer.js";
import { OWNER_EPOCH_HEADER } from "../../src/producer/sendIdempotentBatch.js";
import { OWNER_FENCE_HEADER } from "../../src/producer/sendOwnerFence.js";
import { createMeteringConsumer } from "../../src/topics/metering/consumer/createMeteringConsumer.js";
import type {
	MeteringRecordApplication,
	MeteringRecordFailure,
	MeteringRecordSlice,
	MeteringStaleRecord,
} from "../../src/topics/metering/consumer/types/meteringConsumer.js";
import { serializeMeteringRecord } from "../../src/topics/metering/meteringTopic.js";
import { createState, createTrackMutation } from "../meteringFixtures.js";

const topic = "sliced-topic";
const partition = 1;

type FixtureOptions = {
	/** Thrown by the heartbeat after this many calls: what a rebalance looks like from inside a batch. */
	heartbeatFailsAfter?: number;
	running?: () => boolean;
};

/** The slice of kafkajs a topic consumer touches, recording what it resolved, heartbeat and committed. */
function createConsumerFixture(options: FixtureOptions = {}) {
	const events: string[] = [];
	let runConfig: ConsumerRunConfig | undefined;
	let heartbeats = 0;

	async function connect(): Promise<void> {}
	async function subscribe(): Promise<void> {}
	async function run(config: ConsumerRunConfig = {}): Promise<void> {
		runConfig = config;
	}
	async function stop(): Promise<void> {}
	async function disconnect(): Promise<void> {}
	async function commitOffsets(
		offsets: Array<{ topic: string; partition: number; offset: string }>,
	): Promise<void> {
		for (const position of offsets)
			events.push(`commit:${position.partition}:${position.offset}`);
	}
	function seek(): void {}
	function pause(): void {}
	function resume(): void {}
	function on(): () => void {
		function unsubscribe(): void {}
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
	}: {
		records: Array<{
			offset: string;
			key: Buffer | null;
			value: Buffer | null;
			headers?: IHeaders;
		}>;
	}): Promise<void> {
		if (!runConfig?.eachBatch) throw new Error("Consumer has not started");
		let resolved: string | undefined;
		const messages: KafkaMessage[] = [];
		for (const record of records)
			messages.push({ timestamp: "0", attributes: 0, headers: {}, ...record });
		function firstOffset(): string | null {
			return messages[0]?.offset ?? null;
		}
		function lastOffset(): string {
			return messages.at(-1)?.offset ?? "0";
		}
		function isEmpty(): boolean {
			return messages.length === 0;
		}
		function offsetLag(): string {
			return "0";
		}
		function resolveOffset(offset: string): void {
			events.push(`resolve:${offset}`);
			resolved = offset;
		}
		async function heartbeat(): Promise<void> {
			heartbeats += 1;
			events.push("heartbeat");
			if (
				options.heartbeatFailsAfter !== undefined &&
				heartbeats > options.heartbeatFailsAfter
			)
				throw new Error("REBALANCE_IN_PROGRESS");
		}
		function resumeBatch(): void {}
		function pauseBatch(): () => void {
			return resumeBatch;
		}
		function uncommittedOffsets() {
			if (resolved === undefined) return { topics: [] };
			const offset = (BigInt(resolved) + 1n).toString();
			return { topics: [{ topic, partitions: [{ partition, offset }] }] };
		}
		async function commitOffsetsIfNecessary(): Promise<void> {
			const pending = uncommittedOffsets();
			for (const entry of pending.topics)
				for (const position of entry.partitions)
					await commitOffsets([{ topic: entry.topic, ...position }]);
		}
		function isRunning(): boolean {
			return options.running?.() ?? true;
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

	return { consumer, events, deliverBatch };
}

function record(offset: string) {
	return { offset, key: Buffer.from("k"), value: Buffer.from("v") };
}

function readResumeOffset(): null {
	return null;
}

function offsetsOf(slice: TopicRecordSlice): string {
	return slice.messages.map((message) => message.offset).join(",");
}

test("a slice is resolved, committed and heartbeat after it lands, never before", async () => {
	const fixture = createConsumerFixture();
	async function applyRecords(slice: TopicRecordSlice): Promise<void> {
		fixture.events.push(`apply:${offsetsOf(slice)}`);
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecords },
			progress: createProgressTracker(),
		},
		config: { topic, recordsPerSlice: 2 },
	});
	await consumer.start();
	await fixture.deliverBatch({
		records: [record("0"), record("1"), record("2"), record("3"), record("4")],
	});
	expect(fixture.events).toEqual([
		"apply:0,1",
		"resolve:1",
		"heartbeat",
		"apply:2,3",
		"resolve:3",
		"heartbeat",
		"apply:4",
		"resolve:4",
		"heartbeat",
		`commit:${partition}:5`,
	]);
});

test("a heartbeat that reports a rebalance ends the batch: later slices are never applied, earlier ones stay resolved", async () => {
	const fixture = createConsumerFixture({ heartbeatFailsAfter: 1 });
	async function applyRecords(slice: TopicRecordSlice): Promise<void> {
		fixture.events.push(`apply:${offsetsOf(slice)}`);
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecords },
			progress: createProgressTracker(),
		},
		config: { topic, recordsPerSlice: 2 },
	});
	await consumer.start();
	await expect(
		fixture.deliverBatch({
			records: [record("0"), record("1"), record("2"), record("3")],
		}),
	).rejects.toThrow("REBALANCE_IN_PROGRESS");
	expect(fixture.events).toEqual([
		"apply:0,1",
		"resolve:1",
		"heartbeat",
		"apply:2,3",
		"resolve:3",
		"heartbeat",
	]);
	expect(fixture.events.some((event) => event.startsWith("commit"))).toBe(
		false,
	);
});

test("a partition withdrawn while a slice lands resolves nothing after it", async () => {
	const fixture = createConsumerFixture();
	let consumer: ReturnType<typeof createTopicConsumer> | undefined;
	async function applyRecords(slice: TopicRecordSlice): Promise<void> {
		fixture.events.push(`apply:${offsetsOf(slice)}`);
		if (slice.messages[0]?.offset === "0")
			await consumer?.withdrawPartition({ partition });
	}
	consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecords },
			progress: createProgressTracker(),
		},
		config: { topic, recordsPerSlice: 2 },
	});
	await consumer.start();
	await fixture.deliverBatch({
		records: [record("0"), record("1"), record("2"), record("3")],
	});
	expect(fixture.events).toEqual(["apply:0,1"]);
});

test("a stopped consumer applies nothing", async () => {
	const fixture = createConsumerFixture({ running: () => false });
	async function applyRecords(slice: TopicRecordSlice): Promise<void> {
		fixture.events.push(`apply:${offsetsOf(slice)}`);
	}
	const consumer = createTopicConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecords },
			progress: createProgressTracker(),
		},
		config: { topic, recordsPerSlice: 2 },
	});
	await consumer.start();
	await fixture.deliverBatch({ records: [record("0"), record("1")] });
	expect(fixture.events).toEqual([]);
});

test("a slice size below one is refused", () => {
	const fixture = createConsumerFixture();
	async function applyRecords(): Promise<void> {}
	expect(() =>
		createTopicConsumer({
			ctx: {
				consumer: fixture.consumer,
				handler: { readResumeOffset, applyRecords },
				progress: createProgressTracker(),
			},
			config: { topic, recordsPerSlice: 0 },
		}),
	).toThrow(RangeError);
});

test("a metering slice arrives decoded, fence markers gone, and an undecodable record dropped through onRecordError", async () => {
	const fixture = createConsumerFixture();
	const state = createState();
	const outcome = createTrackMutation({ state, commandId: "command" });
	const slices: MeteringRecordSlice[] = [];
	const failures: MeteringRecordFailure[] = [];
	async function applyRecords(slice: MeteringRecordSlice): Promise<void> {
		slices.push(slice);
	}
	function onRecordError(failure: MeteringRecordFailure): void {
		failures.push(failure);
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecords, onRecordError },
			progress: createProgressTracker(),
		},
		config: { topic, recordsPerSlice: 10 },
	});
	await consumer.start();
	await fixture.deliverBatch({
		records: [
			{ offset: "0", ...serializeMeteringRecord({ record: outcome }) },
			{
				offset: "1",
				key: Buffer.from("owner-fence"),
				value: Buffer.from("{}"),
				headers: { [OWNER_EPOCH_HEADER]: "3", [OWNER_FENCE_HEADER]: "1" },
			},
			{ offset: "2", key: Buffer.from("bad"), value: Buffer.from("{") },
			{
				offset: "3",
				...serializeMeteringRecord({ record: outcome }),
				headers: { [OWNER_EPOCH_HEADER]: "3" },
			},
		],
	});
	expect(slices).toHaveLength(1);
	expect(
		slices[0]?.applications.map(({ position, ownerEpoch }) => ({
			offset: position.offset,
			ownerEpoch,
		})),
	).toEqual([
		{ offset: 0n, ownerEpoch: undefined },
		{ offset: 3n, ownerEpoch: 3n },
	]);
	expect(failures.map(({ offset }) => offset)).toEqual(["2"]);
	expect(fixture.events).toEqual([
		"resolve:3",
		"heartbeat",
		`commit:${partition}:4`,
	]);
});

function fenceAt({ offset, epoch }: { offset: string; epoch: string }) {
	return {
		offset,
		key: Buffer.from("owner-fence"),
		value: Buffer.from("{}"),
		headers: { [OWNER_EPOCH_HEADER]: epoch, [OWNER_FENCE_HEADER]: "1" },
	};
}

test("a slice drops what a stale owner wrote after a higher fence, and keeps the fence owner's and unstamped records", async () => {
	const fixture = createConsumerFixture();
	const outcome = createTrackMutation({
		state: createState(),
		commandId: "command",
	});
	const slices: MeteringRecordSlice[] = [];
	const stale: MeteringStaleRecord[] = [];
	async function applyRecords(slice: MeteringRecordSlice): Promise<void> {
		slices.push(slice);
	}
	function onStaleRecord(record: MeteringStaleRecord): void {
		stale.push(record);
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecords, onStaleRecord },
			progress: createProgressTracker(),
		},
		config: { topic, recordsPerSlice: 10 },
	});
	await consumer.start();
	const stamped = (offset: string, epoch: string) => ({
		offset,
		...serializeMeteringRecord({ record: outcome }),
		headers: { [OWNER_EPOCH_HEADER]: epoch },
	});
	await fixture.deliverBatch({
		records: [
			stamped("0", "2"),
			fenceAt({ offset: "1", epoch: "3" }),
			stamped("2", "2"),
			stamped("3", "3"),
			{ offset: "4", ...serializeMeteringRecord({ record: outcome }) },
			fenceAt({ offset: "5", epoch: "2" }),
			stamped("6", "2"),
		],
	});
	expect(
		slices.flatMap((slice) =>
			slice.applications.map(({ position }) => position.offset),
		),
	).toEqual([0n, 3n, 4n]);
	expect(
		stale.map(({ position, ownerEpoch, fence }) => ({
			offset: position.offset,
			ownerEpoch,
			fence,
		})),
	).toEqual([
		{ offset: 2n, ownerEpoch: 2n, fence: { epoch: 3n, offset: 1n } },
		{ offset: 6n, ownerEpoch: 2n, fence: { epoch: 3n, offset: 1n } },
	]);
	expect(fixture.events).toEqual([
		"resolve:6",
		"heartbeat",
		`commit:${partition}:7`,
	]);
});

test("a record handler without its own fence handling gets the same rule", async () => {
	const fixture = createConsumerFixture();
	const outcome = createTrackMutation({
		state: createState(),
		commandId: "command",
	});
	const applied: bigint[] = [];
	const stale: bigint[] = [];
	function applyRecord({ position }: MeteringRecordApplication): undefined {
		applied.push(position.offset);
		return undefined;
	}
	function onStaleRecord({ position }: MeteringStaleRecord): void {
		stale.push(position.offset);
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecord, onStaleRecord },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await consumer.start();
	const stamped = (offset: string, epoch: string) => ({
		offset,
		...serializeMeteringRecord({ record: outcome }),
		headers: { [OWNER_EPOCH_HEADER]: epoch },
	});
	await fixture.deliverBatch({
		records: [
			stamped("0", "2"),
			fenceAt({ offset: "1", epoch: "3" }),
			stamped("2", "2"),
			stamped("3", "3"),
		],
	});
	expect(applied).toEqual([0n, 3n]);
	expect(stale).toEqual([2n]);
});

test("a metering slice handler without onRecordError fails the batch on an undecodable record", async () => {
	const fixture = createConsumerFixture();
	async function applyRecords(): Promise<void> {}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: fixture.consumer,
			handler: { readResumeOffset, applyRecords },
			progress: createProgressTracker(),
		},
		config: { topic },
	});
	await consumer.start();
	await expect(
		fixture.deliverBatch({
			records: [
				{ offset: "0", key: Buffer.from("bad"), value: Buffer.from("{") },
			],
		}),
	).rejects.toThrow();
	expect(fixture.events).toEqual([]);
});
