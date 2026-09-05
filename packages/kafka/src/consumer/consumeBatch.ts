import type { EachBatchPayload } from "kafkajs";
import { parseKafkaOffset } from "../client/kafkaOffsetUtils.js";
import {
	commitBatchOffsets,
	hasCurrentBatchGeneration,
	reconcilePartitionOffset,
} from "./batchOffsets.js";
import type {
	TopicBatchParams,
	TopicConsumerContext,
	TopicConsumerState,
} from "./types/consumer.js";

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

	if (!state.initializedPartitions.has(JSON.stringify([topic, partition]))) {
		const resume = ctx.handler.readResumeOffset({
			topic,
			partition,
			firstOffset: parseKafkaOffset({ offset: firstMessage.offset }),
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

	for (const message of messages) {
		if (
			!payload.isRunning() ||
			!hasCurrentBatchGeneration({ state, payload, generation })
		)
			return;
		const recordOffset = parseKafkaOffset({ offset: message.offset });
		const application = ctx.handler.applyRecord({ topic, partition, message });
		const result =
			application instanceof Promise ? await application : application;
		if (
			application instanceof Promise &&
			(!payload.isRunning() ||
				!hasCurrentBatchGeneration({ state, payload, generation }))
		)
			return;
		if (result && result.nextOffset > recordOffset + 1n) {
			await reconcilePartitionOffset({
				ctx,
				state,
				payload,
				generation,
				nextOffset: result.nextOffset,
			});
			return;
		}
		payload.resolveOffset(message.offset);
		await payload.heartbeat();
	}

	await commitBatchOffsets({ ctx, state, payload, generation });
}
