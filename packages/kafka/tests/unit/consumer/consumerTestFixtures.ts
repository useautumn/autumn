import type {
	ConsumerEndBatchProcessEvent,
	ConsumerRunConfig,
	EachBatchPayload,
	KafkaMessage,
	OffsetsByTopicPartition,
} from "kafkajs";
import type { KafkaConsumerClient } from "../../../src/consumer/types/consumer.js";

export const topic = "test-topic";
export const partition = 2;

export type ConsumerFixtureOptions = {
	commitGate?: Promise<void>;
	startupFailure?: Error;
	stopFailure?: Error;
	disconnectFailure?: Error;
};

export function createConsumerFixture(options: ConsumerFixtureOptions = {}) {
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

export function createRecord(offset: string) {
	return { offset, key: Buffer.from("key"), value: Buffer.from("value") };
}
