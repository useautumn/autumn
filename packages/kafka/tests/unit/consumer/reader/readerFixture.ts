import {
	type Batch,
	type ConsumerConfig,
	type ConsumerRunConfig,
	Kafka,
	type KafkaMessage,
	type TopicPartitionOffset,
} from "kafkajs";
import type { PartitionReaderConsumer } from "../../../../src/consumer/reader/types/reader.js";

export function createDeferred() {
	let resolve!: () => void;
	function capture(settle: () => void): void {
		resolve = settle;
	}
	const promise = new Promise<void>(capture);
	return { promise, resolve };
}

export function createReaderFixture({
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
