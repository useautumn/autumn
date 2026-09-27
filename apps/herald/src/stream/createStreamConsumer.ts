import {
	createConsumerGroupConfig,
	parseKafkaOffset,
	parseMeteringRecord,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { EachBatchPayload, Kafka } from "kafkajs";
import { landRecords } from "./landRecords/landRecords.js";
import type { StreamConsumer, StreamRecord } from "./types/streamConsumer.js";

// Small on purpose: herald is a follower, and one slow partition must not hold the others.
const PARTITIONS_CONSUMED_CONCURRENTLY = 8;
const CONSUMER_TIMINGS = {
	fetchMaxWaitTimeMs: 250,
	heartbeatIntervalMs: 3000,
	rebalanceTimeoutMs: 60000,
	sessionTimeoutMs: 30000,
};

export type RunningStreamConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

/** Runs one job over the balance log with a consumer group of its own. Everything Kafka lives here, none of it in a job. */
export function createStreamConsumer({
	ctx,
	config,
	streamConsumer,
}: {
	ctx: { kafka: Kafka; logger: AutumnLogger };
	config: { topic: string; groupIdPrefix: string };
	streamConsumer: StreamConsumer;
}): RunningStreamConsumer {
	const groupId = `${config.groupIdPrefix}-${streamConsumer.name}`;
	const consumer = ctx.kafka.consumer(
		createConsumerGroupConfig({ groupId, timings: CONSUMER_TIMINGS }),
	);
	const stopping = new AbortController();

	/** A record that cannot be read is skipped, loudly: one bad record must never hold its partition. */
	function parseBatch({
		batch,
	}: Pick<EachBatchPayload, "batch">): StreamRecord[] {
		const records: StreamRecord[] = [];
		for (const message of batch.messages) {
			try {
				records.push({
					position: {
						topic: batch.topic,
						partition: batch.partition,
						offset: parseKafkaOffset({ offset: message.offset }),
					},
					record: parseMeteringRecord({
						key: message.key,
						value: message.value,
					}),
				});
			} catch (error) {
				ctx.logger.error(
					{
						error,
						type: "herald_record_skipped",
						data: {
							job: streamConsumer.name,
							topic: batch.topic,
							partition: batch.partition,
							offset: message.offset,
						},
					},
					"Herald skipped a record it could not read",
				);
			}
		}
		return records;
	}

	// Offsets resolve and commit only after this returns; landRecords never throws, so a bad record cannot crash the consumer.
	async function handleBatch({
		batch,
		heartbeat,
	}: EachBatchPayload): Promise<void> {
		const records = parseBatch({ batch });
		await landRecords({
			ctx: { logger: ctx.logger, signal: stopping.signal },
			job: streamConsumer,
			records,
		});
		await heartbeat();
	}

	async function start(): Promise<void> {
		await consumer.connect();
		// A job with no saved place starts at the newest record: what came before it was never its to deliver.
		await consumer.subscribe({ topics: [config.topic], fromBeginning: false });
		await consumer.run({
			partitionsConsumedConcurrently: PARTITIONS_CONSUMED_CONCURRENTLY,
			eachBatchAutoResolve: true,
			eachBatch: handleBatch,
		});
	}

	async function stop(): Promise<void> {
		stopping.abort(new Error("Herald stopping"));
		await consumer.disconnect();
	}

	return { start, stop };
}
