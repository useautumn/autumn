import type { EachBatchPayload } from "kafkajs";
import {
	parseKafkaOffset,
	parseKafkaTimestamp,
} from "../client/kafkaOffsetUtils.js";
import { groupChurnCauseOf } from "./consumerErrors.js";
import type {
	TopicBatchParams,
	TopicConsumerContext,
	TopicConsumerState,
} from "./types/consumer.js";

export function hasCurrentBatchGeneration({
	state,
	payload,
	generation,
}: {
	state: TopicConsumerState;
	payload: EachBatchPayload;
	generation: number;
}): boolean {
	return (
		!payload.isStale() &&
		(state.partitionGenerations.get(payload.batch.partition) ?? 0) ===
			generation
	);
}

export async function reconcilePartitionOffset({
	ctx,
	state,
	payload,
	generation,
	nextOffset,
}: {
	ctx: TopicConsumerContext;
	state: TopicConsumerState;
	payload: EachBatchPayload;
	generation: number;
	nextOffset: bigint;
}): Promise<void> {
	const { topic, partition } = payload.batch;
	if (!hasCurrentBatchGeneration({ state, payload, generation })) return;
	if (commitsGroupOffsets({ ctx })) {
		function commitResumeOffset(): Promise<void> {
			return ctx.consumer.commitOffsets([
				{ topic, partition, offset: nextOffset.toString() },
			]);
		}
		const committed = await commitUnlessSuperseded({
			commit: commitResumeOffset,
		});
		if (!committed) return;
	}
	if (!hasCurrentBatchGeneration({ state, payload, generation })) return;
	ctx.consumer.seek({ topic, partition, offset: nextOffset.toString() });
	ctx.progress.advance({ topic, partition, nextOffset });
	state.initializedPartitions.add(JSON.stringify([topic, partition]));
}

export async function commitBatchOffsets({
	ctx,
	state,
	payload,
	generation,
}: TopicBatchParams): Promise<void> {
	const { topic, partition } = payload.batch;
	if (
		!payload.isRunning() ||
		!hasCurrentBatchGeneration({ state, payload, generation })
	)
		return;
	const offset = readPendingOffset(payload);
	if (offset !== null && commitsGroupOffsets({ ctx })) {
		const pendingOffset = offset;
		function commitPendingOffset(): Promise<void> {
			return payload.commitOffsetsIfNecessary({
				topics: [{ topic, partitions: [{ partition, offset: pendingOffset }] }],
			});
		}
		const committed = await commitUnlessSuperseded({
			commit: commitPendingOffset,
		});
		if (!committed) return;
	}
	if (
		!payload.isRunning() ||
		!hasCurrentBatchGeneration({ state, payload, generation })
	)
		return;
	const fetchedNextOffset =
		parseKafkaOffset({ offset: payload.batch.lastOffset() }) + 1n;
	const committedNextOffset =
		offset === null ? fetchedNextOffset : parseKafkaOffset({ offset });
	ctx.progress.advance({
		topic,
		partition,
		nextOffset:
			fetchedNextOffset > committedNextOffset
				? fetchedNextOffset
				: committedNextOffset,
		lastRecordTimestampMs: parseKafkaTimestamp({
			timestamp: payload.batch.messages.at(-1)?.timestamp,
		}),
	});
	state.initializedPartitions.add(JSON.stringify([topic, partition]));
}

/** A commit refused for a superseded generation is dropped; any other group churn is rethrown
 *  unwrapped, because kafkajs crashes the consumer on its non-retriable wrapper instead of rejoining. */
async function commitUnlessSuperseded({
	commit,
}: {
	commit: () => Promise<void>;
}): Promise<boolean> {
	try {
		await commit();
		return true;
	} catch (cause) {
		const churn = groupChurnCauseOf({ cause });
		if (churn?.type === "ILLEGAL_GENERATION") return false;
		throw churn ?? cause;
	}
}

function commitsGroupOffsets({ ctx }: { ctx: TopicConsumerContext }): boolean {
	return ctx.config.commitGroupOffsets ?? true;
}

function readPendingOffset(payload: EachBatchPayload): string | null {
	const { topic, partition } = payload.batch;
	for (const pendingTopic of payload.uncommittedOffsets().topics) {
		if (pendingTopic.topic !== topic) continue;
		for (const pendingPartition of pendingTopic.partitions) {
			if (Number(pendingPartition.partition) === partition)
				return pendingPartition.offset;
		}
	}
	// KafkaJS omits resolved offsets that already match the group's committed offset.
	return null;
}
