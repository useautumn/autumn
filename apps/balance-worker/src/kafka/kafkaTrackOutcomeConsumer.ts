import type {
	Admin,
	Consumer,
	ConsumerRunConfig,
	EachMessageHandler,
} from "kafkajs";
import type { SqliteBalanceStateStore } from "../state/sqliteBalanceStateStore.js";
import {
	parseKafkaRecordOffset,
	processTrackOutcomeRecord,
} from "./processTrackOutcomeRecord.js";

export type KafkaTrackOutcomeConsumerPort = Pick<
	Consumer,
	| "connect"
	| "subscribe"
	| "run"
	| "commitOffsets"
	| "seek"
	| "stop"
	| "disconnect"
	| "events"
	| "on"
>;

export type KafkaPartitionOffsetsPort = Pick<Admin, "fetchTopicOffsets">;

export type KafkaTrackOutcomeConsumerRunConfig = ConsumerRunConfig & {
	autoCommit: false;
	partitionsConsumedConcurrently: number;
	eachMessage: EachMessageHandler;
};

export class KafkaPartitionOffsetsNotFoundError extends Error {
	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Kafka partition offsets not found for ${topic}[${partition}]`);
		this.name = "KafkaPartitionOffsetsNotFoundError";
	}
}

export class StateBehindKafkaLogStartError extends Error {
	readonly storedNextOffset: bigint;
	readonly logStartOffset: bigint;

	constructor({
		topic,
		partition,
		storedNextOffset,
		logStartOffset,
	}: {
		topic: string;
		partition: number;
		storedNextOffset: bigint;
		logStartOffset: bigint;
	}) {
		super(
			`Stored state for ${topic}[${partition}] expects offset ${storedNextOffset}, but the Kafka log starts at ${logStartOffset}`,
		);
		this.name = "StateBehindKafkaLogStartError";
		this.storedNextOffset = storedNextOffset;
		this.logStartOffset = logStartOffset;
	}
}

export const createKafkaTrackOutcomeConsumer = ({
	consumer,
	partitionOffsets,
	topic,
	stateStore,
	partitionsConsumedConcurrently = 1,
}: {
	consumer: KafkaTrackOutcomeConsumerPort;
	partitionOffsets: KafkaPartitionOffsetsPort;
	topic: string;
	stateStore: SqliteBalanceStateStore;
	partitionsConsumedConcurrently?: number;
}): {
	start: () => Promise<void>;
	stop: () => Promise<void>;
} => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (
		!Number.isSafeInteger(partitionsConsumedConcurrently) ||
		partitionsConsumedConcurrently < 1
	) {
		throw new RangeError(
			`Invalid concurrent partition count: ${partitionsConsumedConcurrently}`,
		);
	}

	let isStarted = false;
	let isStopped = false;
	let removeGroupJoinListener: (() => void) | null = null;
	const initializedPartitions = new Set<string>();

	const assertStoredOffsetIsRetained = async ({
		recordTopic,
		partition,
		storedNextOffset,
	}: {
		recordTopic: string;
		partition: number;
		storedNextOffset: bigint;
	}): Promise<void> => {
		const topicOffsets = await partitionOffsets.fetchTopicOffsets(recordTopic);
		const currentPartitionOffsets = topicOffsets.find(
			(offsets) => offsets.partition === partition,
		);
		if (!currentPartitionOffsets) {
			throw new KafkaPartitionOffsetsNotFoundError({
				topic: recordTopic,
				partition,
			});
		}
		const logStartOffset = parseKafkaRecordOffset({
			offset: currentPartitionOffsets.low,
		});
		if (storedNextOffset < logStartOffset) {
			throw new StateBehindKafkaLogStartError({
				topic: recordTopic,
				partition,
				storedNextOffset,
				logStartOffset,
			});
		}
	};

	const commitOffset = async ({
		recordTopic,
		partition,
		nextOffset,
	}: {
		recordTopic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<void> => {
		await consumer.commitOffsets([
			{ topic: recordTopic, partition, offset: nextOffset.toString() },
		]);
	};

	const eachMessage: EachMessageHandler = async ({
		topic: recordTopic,
		partition,
		message,
	}) => {
		const partitionKey = JSON.stringify([recordTopic, partition]);
		if (!initializedPartitions.has(partitionKey)) {
			const recordOffset = parseKafkaRecordOffset({ offset: message.offset });
			const storedNextOffset = stateStore.readNextOffset({
				topic: recordTopic,
				partition,
			});
			if (storedNextOffset !== null && recordOffset !== storedNextOffset) {
				if (recordOffset > storedNextOffset) {
					await assertStoredOffsetIsRetained({
						recordTopic,
						partition,
						storedNextOffset,
					});
				}
				await commitOffset({
					recordTopic,
					partition,
					nextOffset: storedNextOffset,
				});
				consumer.seek({
					topic: recordTopic,
					partition,
					offset: storedNextOffset.toString(),
				});
				initializedPartitions.add(partitionKey);
				return;
			}
		}

		const result = processTrackOutcomeRecord({
			topic: recordTopic,
			partition,
			message,
			stateStore,
		});
		await commitOffset({
			recordTopic,
			partition,
			nextOffset: result.nextOffset,
		});
		initializedPartitions.add(partitionKey);
		if (result.kind === "position_already_applied") {
			consumer.seek({
				topic: recordTopic,
				partition,
				offset: result.nextOffset.toString(),
			});
		}
	};

	const start = async (): Promise<void> => {
		if (isStarted)
			throw new Error("Kafka track outcome consumer already started");
		if (isStopped)
			throw new Error("Kafka track outcome consumer already stopped");

		await consumer.connect();
		removeGroupJoinListener = consumer.on(consumer.events.GROUP_JOIN, () => {
			initializedPartitions.clear();
		});
		try {
			await consumer.subscribe({ topics: [topic], fromBeginning: true });
			const runConfig: KafkaTrackOutcomeConsumerRunConfig = {
				autoCommit: false,
				partitionsConsumedConcurrently,
				eachMessage,
			};
			await consumer.run(runConfig);
			isStarted = true;
		} catch (error) {
			await consumer.disconnect().catch(() => undefined);
			removeGroupJoinListener();
			removeGroupJoinListener = null;
			throw error;
		}
	};

	const stop = async (): Promise<void> => {
		if (!isStarted || isStopped) return;
		isStopped = true;
		try {
			await consumer.stop();
		} finally {
			try {
				await consumer.disconnect();
			} finally {
				removeGroupJoinListener?.();
				removeGroupJoinListener = null;
			}
		}
	};

	return { start, stop };
};
