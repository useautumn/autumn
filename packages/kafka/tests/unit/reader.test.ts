import { describe, expect, test } from "bun:test";
import {
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import {
	type Batch,
	type ConsumerConfig,
	type ConsumerRunConfig,
	Kafka,
	type KafkaMessage,
	type TopicPartitionOffset,
} from "kafkajs";
import { createPartitionReader } from "../../src/consumer/reader/createPartitionReader.js";
import type { PartitionReaderConsumer } from "../../src/consumer/reader/types/reader.js";
import { RecordKeyMismatchError } from "../../src/lib/recordErrors.js";
import { createMeteringReader } from "../../src/topics/metering/consumer/createMeteringReader.js";
import { serializeMeteringRecord } from "../../src/topics/metering/meteringTopic.js";

function createDeferred() {
	let resolve!: () => void;
	function capture(settle: () => void): void {
		resolve = settle;
	}
	const promise = new Promise<void>(capture);
	return { promise, resolve };
}

function createReaderFixture({
	stopGate,
	disconnectFailure,
	runFailure,
	runGate,
}: {
	stopGate?: Promise<void>;
	disconnectFailure?: Error;
	runFailure?: Error;
	runGate?: Promise<void>;
} = {}) {
	const events = new Kafka({ brokers: [] }).consumer({
		groupId: "reader-fixture",
	}).events;
	const listeners = new Map<string, (event: never) => void>();
	const lifecycle: string[] = [];
	const ready = createDeferred();
	const settings: ConsumerConfig[] = [];
	const seeks: TopicPartitionOffset[] = [];
	const pauses: { topic: string; partitions?: number[] }[][] = [];
	let running: ConsumerRunConfig | undefined;
	async function connect(): Promise<void> {
		lifecycle.push("connect");
	}
	async function subscribe(): Promise<void> {
		lifecycle.push("subscribe");
	}
	async function stop(): Promise<void> {
		lifecycle.push("stop");
		await stopGate;
	}
	async function disconnect(): Promise<void> {
		lifecycle.push("disconnect");
		if (disconnectFailure) throw disconnectFailure;
	}
	function seek(offset: TopicPartitionOffset): void {
		seeks.push(offset);
	}
	function pause(topics: { topic: string; partitions?: number[] }[]): void {
		pauses.push(topics);
	}
	function on(eventName: string, listener: (event: never) => void): () => void {
		listeners.set(eventName, listener);
		function remove(): void {
			listeners.delete(eventName);
		}
		return remove;
	}
	function emit({ name, payload }: { name: string; payload: object }): void {
		listeners.get(name)?.({
			id: 0,
			type: name,
			timestamp: 0,
			payload,
		} as never);
	}
	function join({ partitions }: { partitions: (number | string)[] }): void {
		emit({
			name: events.GROUP_JOIN,
			payload: { memberAssignment: { metering: partitions } },
		});
	}
	function rebalance(): void {
		emit({ name: events.REBALANCING, payload: {} });
	}
	async function run(config?: ConsumerRunConfig): Promise<void> {
		lifecycle.push("run");
		if (runFailure) throw runFailure;
		running = config;
		join({ partitions: [0, 2] });
		ready.resolve();
		await runGate;
	}
	function consumer(config: ConsumerConfig): PartitionReaderConsumer {
		settings.push(config);
		return {
			events,
			on,
			connect,
			subscribe,
			run,
			stop,
			disconnect,
			seek,
			pause,
		};
	}
	async function batch({
		offsets,
		last = offsets.at(-1) ?? "-1",
		stale = false,
		key = Buffer.from("key"),
		value,
	}: {
		offsets: string[];
		last?: string;
		stale?: boolean;
		key?: Buffer;
		value?: Buffer;
	}): Promise<void> {
		const messages: KafkaMessage[] = [];
		for (const offset of offsets)
			messages.push({
				offset,
				key,
				value: value ?? Buffer.from(offset),
				timestamp: "0",
				attributes: 0,
				size: 1,
			});
		function isEmpty(): boolean {
			return messages.length === 0;
		}
		function firstOffset(): string | null {
			return offsets[0] ?? null;
		}
		function lastOffset(): string {
			return last;
		}
		function offsetLag(): string {
			return "0";
		}
		const batch: Batch = {
			topic: "metering",
			partition: 2,
			highWatermark: "100",
			messages,
			isEmpty,
			firstOffset,
			lastOffset,
			offsetLag,
			offsetLagLow: offsetLag,
		};
		function resolveOffset(): void {}
		async function heartbeat(): Promise<void> {}
		function resume(): void {}
		function pauseBatch(): () => void {
			return resume;
		}
		async function commitOffsetsIfNecessary(): Promise<void> {}
		function uncommittedOffsets() {
			return { topics: [] };
		}
		function isRunning(): boolean {
			return true;
		}
		function isStale(): boolean {
			return stale;
		}
		await running?.eachBatch?.({
			batch,
			resolveOffset,
			heartbeat,
			pause: pauseBatch,
			commitOffsetsIfNecessary,
			uncommittedOffsets,
			isRunning,
			isStale,
		});
	}
	function filtered({
		last,
		batchSize = 0,
		partition = 2,
	}: {
		last: string;
		batchSize?: number;
		partition?: number;
	}): void {
		emit({
			name: events.END_BATCH_PROCESS,
			payload: {
				topic: "metering",
				partition,
				batchSize,
				highWatermark: "100",
				lastOffset: last,
			},
		});
	}
	return {
		kafka: { consumer },
		lifecycle,
		ready: ready.promise,
		settings,
		seeks,
		pauses,
		batch,
		filtered,
		listeners,
		join,
		rebalance,
	};
}

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (cause) {
		return cause;
	}
	return undefined;
}

async function readsExactRangeAndSettles(): Promise<void> {
	const stop = createDeferred();
	const fake = createReaderFixture({ stopGate: stop.promise });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	await fake.ready;
	expect(fake.settings[0]).toMatchObject({
		allowAutoTopicCreation: false,
		readUncommitted: false,
	});
	expect(fake.seeks).toEqual([
		{ topic: "metering", partition: 2, offset: "2" },
	]);
	expect(fake.pauses).toEqual([[{ topic: "metering", partitions: [0] }]]);
	await fake.batch({ offsets: ["1", "2", "4", "5"] });
	await Bun.sleep(0);
	expect(fake.lifecycle).toContain("stop");
	expect(fake.lifecycle).not.toContain("disconnect");
	stop.resolve();
	const records = await reading;
	expect(records).toEqual([
		{
			partition: 2,
			offset: 2n,
			key: Buffer.from("key"),
			value: Buffer.from("2"),
		},
		{
			partition: 2,
			offset: 4n,
			key: Buffer.from("key"),
			value: Buffer.from("4"),
		},
	]);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
	expect(fake.listeners.size).toBe(0);
}

async function usesConsumedMarkersNotHighWatermarks(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	await fake.ready;
	await fake.batch({ offsets: ["4"], stale: true });
	fake.filtered({ last: "4", batchSize: 1 });
	fake.filtered({ last: "3" });
	await Bun.sleep(0);
	expect(fake.lifecycle).not.toContain("stop");
	fake.filtered({ last: "4" });
	expect(await reading).toEqual([]);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
}

async function cancelsAndTimesOut(): Promise<void> {
	for (const cancellation of ["signal", "disconnect", "timeout"]) {
		const fake = createReaderFixture();
		const controller = new AbortController();
		const reader = createPartitionReader({
			ctx: { kafka: fake.kafka },
			config: { topic: "metering" },
		});
		const reading = reader.readRange({
			partition: 2,
			fromOffset: 2n,
			toOffset: 5n,
			signal: controller.signal,
			timeoutMs: cancellation === "timeout" ? 5 : 1_000,
		});
		const rejected = captureFailure(reading);
		await fake.ready;
		if (cancellation === "signal") controller.abort();
		if (cancellation === "disconnect") await reader.disconnect();
		expect(await rejected).toBeInstanceOf(Error);
		expect(fake.lifecycle.slice(-2)).toEqual(["stop", "disconnect"]);
		expect(fake.listeners.size).toBe(0);
	}
}

async function preservesFailuresAndReportsCleanupFailure(): Promise<void> {
	const original = new Error("run failed");
	const cleanup = new Error("disconnect failed");
	const failed = createReaderFixture({
		runFailure: original,
		disconnectFailure: cleanup,
	});
	const failedReader = createPartitionReader({
		ctx: { kafka: failed.kafka },
		config: { topic: "metering" },
	});
	await expect(
		failedReader.readRange({ partition: 2, fromOffset: 2n, toOffset: 5n }),
	).rejects.toBe(original);
	expect(failed.lifecycle.slice(-2)).toEqual(["stop", "disconnect"]);
	const fake = createReaderFixture({ disconnectFailure: cleanup });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	const rejected = captureFailure(reading);
	await fake.ready;
	fake.filtered({ last: "4" });
	expect(await rejected).toBe(cleanup);
}

async function stopsBeforeWaitingForStartupSettlement(): Promise<void> {
	const startup = createDeferred();
	const fake = createReaderFixture({ runGate: startup.promise });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = captureFailure(
		reader.readRange({ partition: 2, fromOffset: 2n, toOffset: 5n }),
	);
	await fake.ready;
	const disconnect = reader.disconnect();
	await Bun.sleep(0);
	expect(fake.lifecycle.slice(-2)).toEqual(["stop", "disconnect"]);
	startup.resolve();
	await disconnect;
	expect(await reading).toBeInstanceOf(Error);
}

async function reportsCancellationCleanupFailure(): Promise<void> {
	const cleanupFailure = new Error("disconnect failed");
	const fake = createReaderFixture({ disconnectFailure: cleanupFailure });
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = captureFailure(
		reader.readRange({ partition: 2, fromOffset: 2n, toOffset: 5n }),
	);
	await fake.ready;
	await expect(reader.disconnect()).rejects.toBe(cleanupFailure);
	expect(await reading).toMatchObject({ name: "AbortError" });
	await expect(reader.disconnect()).rejects.toBe(cleanupFailure);
}

async function resumesRebalancesWithoutStaleProgress(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createPartitionReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 5n,
	});
	await fake.ready;
	await fake.batch({ offsets: ["2"] });
	fake.rebalance();
	fake.filtered({ last: "4" });
	await Bun.sleep(0);
	expect(fake.lifecycle).not.toContain("stop");
	fake.join({ partitions: ["0", "2"] });
	expect(fake.seeks.at(-1)).toEqual({
		topic: "metering",
		partition: 2,
		offset: "3",
	});
	fake.filtered({ last: "100", partition: 0 });
	await Bun.sleep(0);
	expect(fake.lifecycle).not.toContain("stop");
	await fake.batch({ offsets: ["2", "3"], last: "4" });
	const records = await reading;
	expect(records).toHaveLength(2);
	expect(records[0].offset).toBe(2n);
	expect(records[1].offset).toBe(3n);
}

function partitionReaderTests(): void {
	test(
		"reads only the requested partition range and settles before returning",
		readsExactRangeAndSettles,
	);
	test(
		"uses consumed markers, not watermarks or stale batches, as range completion",
		usesConsumedMarkersNotHighWatermarks,
	);
	test(
		"cancellation, disconnect and timeout stop and disconnect the reader",
		cancelsAndTimesOut,
	);
	test(
		"preserves read failures and rejects cleanup-only failures",
		preservesFailuresAndReportsCleanupFailure,
	);
	test(
		"requests shutdown before waiting for consumer startup to settle",
		stopsBeforeWaitingForStartupSettlement,
	);
	test(
		"reports shutdown cleanup failure without replacing a canceled read's primary error",
		reportsCancellationCleanupFailure,
	);
	test(
		"normalizes assignments and resumes without stale progress or duplicate records",
		resumesRebalancesWithoutStaleProgress,
	);
}

function createOutcome() {
	const identity = {
		orgId: "org_1",
		env: "sandbox" as const,
		customerId: "customer_1",
	};
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
			value: 1,
			overageBehavior: "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});
	const decision = computeTrack({
		deduplicationExpiresAt: 1_700_086_400_000,
		state,
		command,
	});
	if (decision.kind !== "new") throw new Error("Expected a new outcome");
	return decision.outcome;
}

async function readsTypedRecordsWithoutAStore(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createMeteringReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const record = createOutcome();
	const serialized = serializeMeteringRecord({ record });
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 3n,
	});
	await fake.ready;
	await fake.batch({ offsets: ["2"], ...serialized });
	expect(await reading).toEqual([{ partition: 2, offset: 2n, record }]);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
}

async function rejectsMismatchedTopicRecords(): Promise<void> {
	const fake = createReaderFixture();
	const reader = createMeteringReader({
		ctx: { kafka: fake.kafka },
		config: { topic: "metering" },
	});
	const serialized = serializeMeteringRecord({
		record: createOutcome(),
	});
	const reading = reader.readRange({
		partition: 2,
		fromOffset: 2n,
		toOffset: 3n,
	});
	await fake.ready;
	await fake.batch({
		offsets: ["2"],
		...serialized,
		key: Buffer.from("wrong"),
	});
	await expect(reading).rejects.toBeInstanceOf(RecordKeyMismatchError);
	expect(fake.lifecycle.at(-1)).toBe("disconnect");
}

function meteringReaderTests(): void {
	test(
		"reads typed metering entries without a balance-worker or SQLite dependency",
		readsTypedRecordsWithoutAStore,
	);
	test(
		"validates metering keys after the underlying read is settled",
		rejectsMismatchedTopicRecords,
	);
}

describe("partitionReader", partitionReaderTests);
describe("meteringReader", meteringReaderTests);
