import {
	type MeteringFenceApplication,
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
import {
	OwnedPartitionProducerFencedError,
	OwnerEpochSupersededError,
} from "../../runtime/runtimeErrors.js";
import type { DurableMutationApplyResult } from "../../state/types/durableMutation.js";
import type { OwnerFence, StateStore } from "../../state/types/stateStore.js";
import {
	isPartitionInvariantCause,
	KafkaPartitionInvariantError,
	StateBehindKafkaLogStartError,
} from "./meteringErrors.js";
import { createStaleRecordLog } from "./staleRecordLog.js";
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
		/** The epoch this worker's writer holds each partition under; a fence above it means the partition is lost. */
		ownerEpochByPartition?: ReadonlyMap<number, () => string | undefined>;
		logger?: Pick<AutumnLogger, "warn">;
		now?: () => number;
	};
}): MeteringRecordHandler {
	// The fence as read from the log so far, ahead of the store's bookmark; the store's copy seeds it.
	const fenceByPartition = new Map<number, OwnerFence>();
	const staleRecords = createStaleRecordLog({
		logger: ctx.logger,
		now: ctx.now,
	});
	function currentFence({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): OwnerFence | null {
		const seen = fenceByPartition.get(partition);
		if (seen) return seen;
		const stored =
			ctx.stateStore.readOwnerFence?.({ topic, partition }) ?? null;
		if (stored) fenceByPartition.set(partition, stored);
		return stored;
	}
	/** Written after the fence by an epoch the fence outranks: a stale owner's, dropped whoever is reading. */
	function isStale({
		position,
		ownerEpoch,
	}: {
		position: { topic: string; partition: number; offset: bigint };
		ownerEpoch: bigint | undefined;
	}): OwnerFence | null {
		if (ownerEpoch === undefined) return null;
		const fence = currentFence(position);
		if (!fence) return null;
		if (position.offset <= fence.offset || ownerEpoch >= fence.epoch)
			return null;
		return fence;
	}
	/** A marker raises the partition's fence; one from above this worker's own epoch ends its ownership. */
	function applyFence({
		position,
		ownerEpoch,
	}: MeteringFenceApplication):
		| { nextOffset: bigint }
		| undefined
		| Promise<{ nextOffset: bigint } | undefined> {
		const { topic, partition } = position;
		const current = currentFence(position);
		if (current && current.epoch >= ownerEpoch) return undefined;
		const fence: OwnerFence = { epoch: ownerEpoch, offset: position.offset };
		fenceByPartition.set(partition, fence);
		if (ctx.readOnlyPartitions?.has(partition)) return undefined;
		const own = ctx.ownerEpochByPartition?.get(partition)?.();
		if (own !== undefined && BigInt(own) < ownerEpoch) {
			parkPartition({
				topic,
				partition,
				cause: new OwnedPartitionProducerFencedError({
					topic,
					partition,
					cause: new OwnerEpochSupersededError({
						topic,
						partition,
						ownEpoch: BigInt(own),
						fenceEpoch: ownerEpoch,
						fenceOffset: position.offset,
					}),
				}),
			});
			return undefined;
		}
		const advanced = ctx.stateStore.advanceOwnerFence?.({
			topic,
			partition,
			fence,
		});
		if (advanced instanceof Promise) return advanced.then(() => undefined);
		return undefined;
	}
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
		ownerEpoch,
	}: MeteringRecordApplication):
		| { nextOffset: bigint }
		| undefined
		| Promise<{ nextOffset: bigint } | undefined> {
		const fence = isStale({ position, ownerEpoch });
		if (fence && ownerEpoch !== undefined) {
			staleRecords.record({ ...position, ownerEpoch, fence });
			return undefined;
		}
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

	return {
		readResumeOffset,
		shouldApply,
		applyFence,
		applyRecord,
		onRecordError,
	};
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
