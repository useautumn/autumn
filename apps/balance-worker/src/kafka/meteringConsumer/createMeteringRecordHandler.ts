import {
	type MeteringRecordApplication,
	type MeteringRecordFailure,
	type MeteringRecordHandler,
	parseKafkaOffset,
	readPartitionLogRange,
	type TopicResumePosition,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { Admin } from "kafkajs";
import type { RecentCommands } from "../../processor/writer/recentCommands/types/recentCommands.js";
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
		recentCommandsByPartition: ReadonlyMap<number, RecentCommands>;
		replayFloorByPartition: ReadonlyMap<number, bigint>;
		logger?: Pick<AutumnLogger, "warn">;
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
		// A starting replay reads from its floor up to the bookmark on purpose.
		const floor = ctx.replayFloorByPartition.get(partition);
		if (floor === undefined) return storedNextOffset;
		return firstOffset < floor ? floor : null;
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
		const settle = (results: DurableMutationApplyResult[]) => {
			if (landedOnStore(results))
				ctx.recentCommandsByPartition
					.get(position.partition)
					?.remember({ mutation: record });
			if (isInsideReplayWindow({ position })) return undefined;
			return replayedOffsetOf(results);
		};
		if (applied instanceof Promise) return applied.then(settle);
		return settle(applied);
	}

	/** A record below the bookmark is already in the store: one it cannot read is skipped, never fatal. */
	function isInsideReplayWindow({
		position,
	}: {
		position: { topic: string; partition: number; offset: bigint };
	}): boolean {
		const floor = ctx.replayFloorByPartition.get(position.partition);
		if (floor === undefined || position.offset < floor) return false;
		const storedNextOffset = ctx.stateStore.readNextOffset(position);
		return storedNextOffset !== null && position.offset < storedNextOffset;
	}

	function onRecordError({
		topic,
		partition,
		offset,
		cause,
	}: MeteringRecordFailure): undefined {
		const position = { topic, partition, offset: parseKafkaOffset({ offset }) };
		if (isInsideReplayWindow({ position })) {
			ctx.logger?.warn("Replay window record skipped", {
				topic,
				partition,
				offset,
				error: cause,
			});
			return undefined;
		}
		if (!isPartitionInvariantCause(cause)) throw cause;
		throw new KafkaPartitionInvariantError({ topic, partition, offset, cause });
	}

	return { readResumeOffset, applyRecord, onRecordError };
}

/** Applied now or already in the store: either way the log record is the receipt for its command id. */
function landedOnStore(results: DurableMutationApplyResult[]): boolean {
	const [result] = results;
	return (
		result?.kind === "applied" ||
		result?.kind === "duplicate" ||
		result?.kind === "position_already_applied"
	);
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
