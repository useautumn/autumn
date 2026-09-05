import {
	type MeteringRecordApplication,
	type MeteringRecordFailure,
	type MeteringRecordHandler,
	readPartitionLogRange,
	type TopicResumePosition,
} from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import {
	isPartitionInvariantCause,
	KafkaPartitionInvariantError,
	StateBehindKafkaLogStartError,
} from "./meteringErrors.js";

export function createMeteringRecordHandler({
	ctx,
}: {
	ctx: {
		stateStore: SqliteBalanceStateStore;
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

	function applyRecord({
		position,
		record,
	}: MeteringRecordApplication): { nextOffset: bigint } | undefined {
		const result =
			record.type === "state_initialized"
				? ctx.stateStore.applyDurableStateInitialization({
						position,
						initialization: record,
					})
				: ctx.stateStore.applyDurableTrackOutcome({
						position,
						outcome: record,
					});
		if (result.kind === "position_already_applied") {
			return { nextOffset: result.nextOffset };
		}
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
