import type { Consumer, ConsumerRunConfig, EachMessageHandler } from "kafkajs";
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
>;

export type KafkaTrackOutcomeConsumerRunConfig = ConsumerRunConfig & {
	autoCommit: false;
	partitionsConsumedConcurrently: number;
	eachMessage: EachMessageHandler;
};

export const createKafkaTrackOutcomeConsumer = ({
	consumer,
	topic,
	stateStore,
	partitionsConsumedConcurrently = 1,
}: {
	consumer: KafkaTrackOutcomeConsumerPort;
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
	const initializedPartitions = new Set<string>();

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
			throw error;
		}
	};

	const stop = async (): Promise<void> => {
		if (!isStarted || isStopped) return;
		isStopped = true;
		try {
			await consumer.stop();
		} finally {
			await consumer.disconnect();
		}
	};

	return { start, stop };
};
