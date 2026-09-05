import { consumePartitionRange } from "./consumePartitionRange.js";
import type {
	PartitionLogRecord,
	PartitionReaderConfig,
	PartitionReaderConsumer,
	PartitionReaderKafka,
	PartitionReadRange,
	PartitionReadState,
} from "./types/reader.js";

export async function readPartitionRange({
	ctx,
	config,
	range,
	state,
}: {
	ctx: { kafka: PartitionReaderKafka };
	config: PartitionReaderConfig;
	range: PartitionReadRange;
	state: PartitionReadState;
}): Promise<readonly PartitionLogRecord[]> {
	range.signal?.throwIfAborted();
	if (range.fromOffset >= range.toOffset) return [];
	const timeoutMs = range.timeoutMs ?? 15_000;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
		throw new RangeError("timeoutMs must be a positive safe integer");
	const consumer = ctx.kafka.consumer({
		groupId: `${config.groupIdPrefix ?? "autumn-partition-reader"}-${crypto.randomUUID()}`,
		allowAutoTopicCreation: false,
		readUncommitted: false,
		maxWaitTimeInMs: 250,
	});
	let failed = false;
	try {
		await consumer.connect();
		range.signal?.throwIfAborted();
		await consumer.subscribe({ topics: [config.topic], fromBeginning: true });
		return await consumePartitionRange({
			consumer,
			state,
			topic: config.topic,
			range,
			timeoutMs,
		});
	} catch (cause) {
		failed = true;
		throw cause;
	} finally {
		try {
			await closeRangeConsumer({ consumer, state, preserveFailure: failed });
		} finally {
			await state.running;
		}
	}
}

async function closeRangeConsumer({
	consumer,
	state,
	preserveFailure,
}: {
	consumer: PartitionReaderConsumer;
	state: PartitionReadState;
	preserveFailure: boolean;
}): Promise<void> {
	const failures: unknown[] = [];
	try {
		await consumer.stop();
	} catch (cause) {
		failures.push(cause);
	}
	try {
		await consumer.disconnect();
	} catch (cause) {
		failures.push(cause);
	}
	if (failures.length === 0) return;
	state.cleanupFailure =
		failures.length === 1
			? failures[0]
			: new AggregateError(failures, "Partition reader cleanup failed");
	if (!preserveFailure) throw state.cleanupFailure;
}
