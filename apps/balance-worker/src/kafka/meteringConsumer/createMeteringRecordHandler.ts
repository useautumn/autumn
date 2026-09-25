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
import type { ProducedOffsets } from "../../processor/writer/producedOffsets/createProducedOffsets.js";
import type { RecentCommands } from "../../processor/writer/recentCommands/types/recentCommands.js";
import type { DurableMutationApplyResult } from "../../state/types/durableMutation.js";
import type { StateStore } from "../../state/types/stateStore.js";
import {
	isPartitionInvariantCause,
	KafkaPartitionInvariantError,
	StateBehindKafkaLogStartError,
} from "./meteringErrors.js";
import type { PartitionReplay } from "./types/partitionReplay.js";

export function createMeteringRecordHandler({
	ctx,
}: {
	ctx: {
		stateStore: StateStore;
		partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
		recentCommandsByPartition: ReadonlyMap<number, RecentCommands>;
		/** Absent for a partition means every record is read. */
		producedOffsetsByPartition?: ReadonlyMap<number, ProducedOffsets>;
		replayFloorByPartition: ReadonlyMap<number, bigint>;
		/** The replay reading each partition; a log it cannot read parks that partition through it. */
		replayByPartition: ReadonlyMap<
			number,
			Pick<PartitionReplay, "markUnavailable">
		>;
		/** Partitions another worker still owns: their records feed the dedup window and nothing else. */
		readOnlyPartitions?: ReadonlySet<number>;
		logger?: Pick<AutumnLogger, "warn">;
	};
}): MeteringRecordHandler {
	/** Parks the partition behind the unreadable record; without a replay to park, the failure is thrown as before. */
	function parkPartition({
		topic,
		partition,
		cause,
	}: {
		topic: string;
		partition: number;
		cause: Error;
	}): void {
		const replay = ctx.replayByPartition.get(partition);
		if (!replay) throw cause;
		ctx.logger?.warn("Partition log cannot be read; parking the partition", {
			topic,
			partition,
			error: cause,
		});
		replay.markUnavailable({ cause });
	}

	function readResumeOffset({
		topic,
		partition,
		firstOffset,
	}: TopicResumePosition): bigint | null | Promise<bigint | null> {
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

	/** Null here means no seek: the parked partition's batch then finds its generation gone and applies nothing. */
	async function readRetainedResumeOffset({
		topic,
		partition,
		storedNextOffset,
	}: {
		topic: string;
		partition: number;
		storedNextOffset: bigint;
	}): Promise<bigint | null> {
		const { logStartOffset } = await readPartitionLogRange({
			ctx: { partitionOffsets: ctx.partitionOffsets },
			topic,
			partition,
		});
		if (storedNextOffset < logStartOffset) {
			parkPartition({
				topic,
				partition,
				cause: new StateBehindKafkaLogStartError({
					topic,
					partition,
					storedNextOffset,
					logStartOffset,
				}),
			});
			return null;
		}
		return storedNextOffset;
	}

	/** A record this process's writer produced was projected and queued for the store when it was decided; the writer also remembered its command. Reading it back would only repeat that. */
	function shouldApply(position: {
		topic: string;
		partition: number;
		offset: bigint;
	}): boolean {
		const produced = ctx.producedOffsetsByPartition?.get(position.partition);
		return !produced?.has({ offset: position.offset });
	}

	/** Stays synchronous for a resident store: the writer-race offset must be visible before the next record. */
	function applyRecord({
		position,
		record,
	}: MeteringRecordApplication):
		| { nextOffset: bigint }
		| undefined
		| Promise<{ nextOffset: bigint } | undefined> {
		if (ctx.readOnlyPartitions?.has(position.partition)) {
			ctx.recentCommandsByPartition
				.get(position.partition)
				?.remember({ mutation: record });
			return undefined;
		}
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
		// An offset that will not parse is itself the failure; it is outside any window.
		const position = readPosition({ topic, partition, offset });
		if (position && isInsideReplayWindow({ position })) {
			ctx.logger?.warn("Replay window record skipped", {
				topic,
				partition,
				offset,
				error: cause,
			});
			return undefined;
		}
		if (!isPartitionInvariantCause(cause)) throw cause;
		parkPartition({
			topic,
			partition,
			cause: new KafkaPartitionInvariantError({
				topic,
				partition,
				offset,
				cause,
			}),
		});
		return undefined;
	}

	return { readResumeOffset, shouldApply, applyRecord, onRecordError };
}

function readPosition({
	topic,
	partition,
	offset,
}: {
	topic: string;
	partition: number;
	offset: string;
}): { topic: string; partition: number; offset: bigint } | null {
	try {
		return { topic, partition, offset: parseKafkaOffset({ offset }) };
	} catch {
		return null;
	}
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
