import {
	type MeteringRecordApplication,
	type MeteringRecordFailure,
	type MeteringRecordHandler,
	readPartitionLogRange,
	type TopicResumePosition,
} from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { DurableMutationApplyResult } from "../../state/types/durableMutation.js";
import type { StateStore } from "../../state/types/stateStore.js";
import {
	isPartitionInvariantCause,
	KafkaPartitionInvariantError,
	StateBehindKafkaLogStartError,
} from "./meteringErrors.js";

export function createMeteringRecordHandler({
	ctx,
}: {
	ctx: {
		stateStore: StateStore;
		partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	};
}): MeteringRecordHandler {
	function readResumeOffset({
		topic,
		partition,
		firstOffset,
	}: TopicResumePosition): bigint | null | Promise<bigint> {
		const storedNextOffset = ctx.stateStore.readNextOffset({
			topic,
			partition,
		});
		if (storedNextOffset === null || storedNextOffset === firstOffset)
			return null;
		if (firstOffset > storedNextOffset) {
			return readRetainedResumeOffset({ topic, partition, storedNextOffset });
		}
		return storedNextOffset;
	}

	async function readRetainedResumeOffset({
		topic,
		partition,
		storedNextOffset,
	}: {
		topic: string;
		partition: number;
		storedNextOffset: bigint;
	}): Promise<bigint> {
		const { logStartOffset } = await readPartitionLogRange({
			ctx: { partitionOffsets: ctx.partitionOffsets },
			topic,
			partition,
		});
		if (storedNextOffset < logStartOffset) {
			throw new StateBehindKafkaLogStartError({
				topic,
				partition,
				storedNextOffset,
				logStartOffset,
			});
		}
		return storedNextOffset;
	}

	/** Stays synchronous for a resident store: the writer-race offset must be visible before the next record. */
	function applyRecord({
		position,
		record,
	}: MeteringRecordApplication):
		| { nextOffset: bigint }
		| undefined
		| Promise<{ nextOffset: bigint } | undefined> {
		const applied = ctx.stateStore.applyDurableMutations({
			records: [{ position, mutation: record }],
		});
		if (applied instanceof Promise) return applied.then(replayedOffsetOf);
		return replayedOffsetOf(applied);
	}

	function onRecordError({
		topic,
		partition,
		offset,
		cause,
	}: MeteringRecordFailure): never {
		if (!isPartitionInvariantCause(cause)) throw cause;
		throw new KafkaPartitionInvariantError({ topic, partition, offset, cause });
	}

	return { readResumeOffset, applyRecord, onRecordError };
}

function replayedOffsetOf(
	results: DurableMutationApplyResult[],
): { nextOffset: bigint } | undefined {
	const [result] = results;
	if (result?.kind === "failed") throw result.cause;
	// A rejected record is settled: nothing of it landed and the bookmark is already past it.
	if (result?.kind === "position_already_applied") {
		return { nextOffset: result.nextOffset };
	}
}
