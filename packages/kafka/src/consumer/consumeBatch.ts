import type { EachBatchPayload } from "kafkajs";
import { parseKafkaOffset } from "../client/kafkaOffsetUtils.js";
import {
	commitBatchOffsets,
	hasCurrentBatchGeneration,
	reconcilePartitionOffset,
} from "./batchOffsets.js";
import {
	isRecordsHandler,
	type TopicBatchParams,
	type TopicConsumerContext,
	type TopicConsumerState,
	type TopicRecord,
	type TopicRecordHandler,
} from "./types/consumer.js";

const DEFAULT_RECORDS_PER_SLICE = 500;

export async function consumeBatch({
	ctx,
	state,
	payload,
}: {
	ctx: TopicConsumerContext;
	state: TopicConsumerState;
	payload: EachBatchPayload;
}): Promise<void> {
	const { partition } = payload.batch;
	if (state.withdrawnPartitions.has(partition)) return;
	const operation = applyBatch({
		ctx,
		state,
		payload,
		generation: state.partitionGenerations.get(partition) ?? 0,
	});
	const pending =
		state.activeBatches.get(partition) ?? new Set<Promise<void>>();
	state.activeBatches.set(partition, pending);
	pending.add(operation);
	try {
		await operation;
	} finally {
		pending.delete(operation);
	}
}

async function applyBatch({
	ctx,
	state,
	payload,
	generation,
}: TopicBatchParams): Promise<void> {
	const { topic, partition, messages } = payload.batch;
	ctx.progress.observeHighWatermark({
		topic,
		partition,
		highWatermark: parseKafkaOffset({ offset: payload.batch.highWatermark }),
	});
	const firstMessage = messages[0];
	if (!firstMessage) return;

	// An offset that will not parse is the handler's to judge, so the resume read waits for a readable one.
	const firstOffset = readOffsetOrNull({ offset: firstMessage.offset });
	if (
		firstOffset !== null &&
		!state.initializedPartitions.has(JSON.stringify([topic, partition]))
	) {
		const resume = ctx.handler.readResumeOffset({
			topic,
			partition,
			firstOffset,
		});
		const resumeOffset = resume instanceof Promise ? await resume : resume;
		if (resumeOffset !== null) {
			await reconcilePartitionOffset({
				ctx,
				state,
				payload,
				generation,
				nextOffset: resumeOffset,
			});
			return;
		}
	}

	if (isRecordsHandler(ctx.handler)) {
		const settled = await applySlices({ ctx, state, payload, generation });
		if (settled) await commitBatchOffsets({ ctx, state, payload, generation });
		return;
	}

	for (let start = 0; start < messages.length; ) {
		if (
			!payload.isRunning() ||
			!hasCurrentBatchGeneration({ state, payload, generation })
		)
			return;
		const run = recordRunAt({
			handler: ctx.handler,
			topic,
			partition,
			messages,
			start,
		});
		const application =
			run.length > 1 && ctx.handler.applyRun
				? ctx.handler.applyRun({ topic, partition, messages: run })
				: ctx.handler.applyRecord({
						topic,
						partition,
						message: messages[start] as TopicRecord["message"],
					});
		const result =
			application instanceof Promise ? await application : application;
		// A handler may withdraw the partition while applying; nothing of that record is resolved then.
		if (
			!payload.isRunning() ||
			!hasCurrentBatchGeneration({ state, payload, generation })
		)
			return;
		const last = run.at(-1) as TopicRecord["message"];
		const recordOffset = parseKafkaOffset({ offset: last.offset });
		if (result && result.nextOffset > recordOffset + 1n) {
			await ctx.handler.settleBatch?.({ topic, partition });
			await reconcilePartitionOffset({
				ctx,
				state,
				payload,
				generation,
				nextOffset: result.nextOffset,
			});
			return;
		}
		payload.resolveOffset(last.offset);
		await payload.heartbeat();
		start += run.length;
	}

	await ctx.handler.settleBatch?.({ topic, partition });
	await commitBatchOffsets({ ctx, state, payload, generation });
}

/**
 * Lands the batch a slice at a time: a slice is resolved only once it returned, and the heartbeat after it
 * is where a lost partition surfaces, so nothing past the slice in flight is ever written under an old lease.
 * False when the batch was cut short; its resolved slices are still committed by the caller's runner.
 */
async function applySlices({
	ctx,
	state,
	payload,
	generation,
}: TopicBatchParams): Promise<boolean> {
	if (!isRecordsHandler(ctx.handler)) return true;
	const { topic, partition, messages } = payload.batch;
	const size = ctx.config.recordsPerSlice ?? DEFAULT_RECORDS_PER_SLICE;
	for (let start = 0; start < messages.length; start += size) {
		if (
			!payload.isRunning() ||
			!hasCurrentBatchGeneration({ state, payload, generation })
		)
			return false;
		const slice: TopicRecord["message"][] = messages.slice(start, start + size);
		await ctx.handler.applyRecords({
			topic,
			partition,
			messages: slice,
			heartbeat: payload.heartbeat,
		});
		if (
			!payload.isRunning() ||
			!hasCurrentBatchGeneration({ state, payload, generation })
		)
			return false;
		const last = slice.at(-1);
		if (last) payload.resolveOffset(last.offset);
		await payload.heartbeat();
	}
	return true;
}

function readOffsetOrNull({ offset }: { offset: string }): bigint | null {
	try {
		return parseKafkaOffset({ offset });
	} catch {
		return null;
	}
}

/** The records from `start` the handler takes as one run: at least the one record, never past the batch. */
function recordRunAt({
	handler,
	topic,
	partition,
	messages,
	start,
}: {
	handler: TopicRecordHandler;
	topic: string;
	partition: number;
	messages: TopicRecord["message"][];
	start: number;
}): TopicRecord["message"][] {
	const length =
		handler.runLength?.({ topic, partition, messages, start }) ?? 1;
	return messages.slice(start, start + Math.max(1, length));
}
