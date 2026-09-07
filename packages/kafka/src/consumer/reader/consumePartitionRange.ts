import type {
	ConsumerCrashEvent,
	ConsumerEndBatchProcessEvent,
	ConsumerGroupJoinEvent,
	EachBatchPayload,
} from "kafkajs";
import { parseKafkaOffset } from "../../client/kafkaOffsetUtils.js";
import type {
	PartitionLogRecord,
	PartitionReaderConsumer,
	PartitionReadRange,
	PartitionReadState,
} from "./types/reader.js";

export async function consumePartitionRange({
	consumer,
	state,
	topic,
	range,
	timeoutMs,
}: {
	consumer: PartitionReaderConsumer;
	state: PartitionReadState;
	topic: string;
	range: PartitionReadRange;
	timeoutMs: number;
}): Promise<readonly PartitionLogRecord[]> {
	const { partition, fromOffset, toOffset, signal } = range;
	const records: PartitionLogRecord[] = [];
	let settled = false;
	let seeking = false;
	let nextOffset = fromOffset;
	const completion = Promise.withResolvers<void>();
	function finish(): void {
		if (settled) return;
		settled = true;
		completion.resolve();
	}
	function fail(cause: unknown): void {
		if (settled) return;
		settled = true;
		completion.reject(cause);
	}
	function onTimeout(): void {
		fail(
			new Error(
				`Timed out reading ${topic}[${partition}] [${fromOffset}, ${toOffset})`,
			),
		);
	}
	function onAbort(): void {
		fail(signal?.reason);
	}
	function onCrash(event: ConsumerCrashEvent): void {
		fail(event.payload.error);
	}
	function onRebalancing(): void {
		seeking = false;
	}
	function onGroupJoin(event: ConsumerGroupJoinEvent): void {
		if (settled) return;
		try {
			const others: number[] = [];
			let assigned = false;
			for (const assignment of event.payload.memberAssignment[topic] ?? []) {
				const assignedPartition = Number(assignment);
				if (assignedPartition === partition) assigned = true;
				else others.push(assignedPartition);
			}
			if (!assigned)
				throw new Error(`Reader was not assigned ${topic}[${partition}]`);
			if (others.length > 0) consumer.pause([{ topic, partitions: others }]);
			consumer.seek({ topic, partition, offset: nextOffset.toString() });
			seeking = true;
		} catch (cause) {
			fail(cause);
		}
	}
	function onBatchProcessed(event: ConsumerEndBatchProcessEvent): void {
		const { payload } = event;
		if (
			settled ||
			!seeking ||
			payload.topic !== topic ||
			payload.partition !== partition ||
			payload.batchSize !== 0
		)
			return;
		try {
			// Only consumed filtered records prove progress; a high watermark does not.
			const consumedNextOffset =
				parseKafkaOffset({ offset: payload.lastOffset }) + 1n;
			if (consumedNextOffset > nextOffset) nextOffset = consumedNextOffset;
			if (nextOffset >= toOffset) finish();
		} catch (cause) {
			fail(cause);
		}
	}
	async function eachBatch({
		batch,
		resolveOffset,
		heartbeat,
		isStale,
		isRunning,
	}: EachBatchPayload): Promise<void> {
		if (
			settled ||
			!seeking ||
			batch.topic !== topic ||
			batch.partition !== partition ||
			isStale() ||
			!isRunning()
		)
			return;
		try {
			for (const message of batch.messages) {
				if (settled || signal?.aborted || isStale() || !isRunning()) return;
				const offset = parseKafkaOffset({ offset: message.offset });
				if (offset >= toOffset) {
					finish();
					return;
				}
				if (offset >= nextOffset)
					records.push({
						partition,
						offset,
						key: message.key,
						value: message.value,
					});
				resolveOffset(message.offset);
				if (offset + 1n > nextOffset) nextOffset = offset + 1n;
				await heartbeat();
			}
			if (
				!isStale() &&
				parseKafkaOffset({ offset: batch.lastOffset() }) + 1n >= toOffset
			)
				finish();
		} catch (cause) {
			fail(cause);
		}
	}
	async function runConsumer(): Promise<void> {
		try {
			await consumer.run({
				autoCommit: false,
				eachBatchAutoResolve: false,
				eachBatch,
			});
		} catch (cause) {
			fail(cause);
		}
	}
	const removeGroupJoin = consumer.on(consumer.events.GROUP_JOIN, onGroupJoin);
	const removeBatchProcessed = consumer.on(
		consumer.events.END_BATCH_PROCESS,
		onBatchProcessed,
	);
	const removeCrash = consumer.on(consumer.events.CRASH, onCrash);
	const removeRebalancing = consumer.on(
		consumer.events.REBALANCING,
		onRebalancing,
	);
	const timeout = setTimeout(onTimeout, timeoutMs);
	signal?.addEventListener("abort", onAbort, { once: true });
	if (signal?.aborted) onAbort();
	state.running = settled ? undefined : runConsumer();
	try {
		await completion.promise;
		return records;
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", onAbort);
		removeGroupJoin();
		removeBatchProcessed();
		removeCrash();
		removeRebalancing();
	}
}
