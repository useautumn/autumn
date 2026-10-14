import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
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
		producedOffsetsByPartition?: ReadonlyMap<number, ProducedOffsets>;
		replayFloorByPartition: ReadonlyMap<number, bigint>;
		replayByPartition: ReadonlyMap<
			number,
			Pick<PartitionReplay, "markUnavailable">
		>;
		readOnlyPartitions?: ReadonlySet<number>;
		ownerEpochByPartition?: ReadonlyMap<number, () => string | undefined>;
		logger?: Pick<AutumnLogger, "warn">;
		now?: () => number;
	};
}): MeteringRecordHandler {
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

	function shouldApply(position: {
		topic: string;
		partition: number;
		offset: bigint;
	}): boolean {
		const produced = ctx.producedOffsetsByPartition?.get(position.partition);
		return !produced?.has({ offset: position.offset });
	}

	function isOwnWrite({
		partition,
		ownerEpoch,
	}: {
		partition: number;
		ownerEpoch: bigint | undefined;
	}): boolean {
		if (ownerEpoch === undefined) return false;
		if (!ctx.producedOffsetsByPartition?.has(partition)) return false;
		const own = ctx.ownerEpochByPartition?.get(partition)?.();
		return own !== undefined && BigInt(own) === ownerEpoch;
	}

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
		if (isOwnWrite({ partition: position.partition, ownerEpoch }))
			return undefined;
		if (ctx.readOnlyPartitions?.has(position.partition)) {
			ctx.recentCommandsByPartition
				.get(position.partition)
				?.remember({ mutation: record });
			return undefined;
		}
		const applied = ctx.stateStore.applyDurableMutations({
			records: [{ position, mutation: record }],
			snapshotIntent: new Map([
				[
					meteringIdentityToPartitionKey({ identity: record.identity }),
					"delete",
				],
			]),
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
	if (result?.kind === "position_already_applied") {
		return { nextOffset: result.nextOffset };
	}
}
