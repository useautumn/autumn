import {
	ownershipTopic,
	parseOwnershipRecordIfKnown,
} from "../ownershipTopic.js";
import type { OwnershipLog } from "../types/ownershipLog.js";
import type { OwnershipRecord } from "../types/ownershipRecord.js";
import type { PartitionOwner } from "../types/partitionOwner.js";
import type {
	OwnershipConsumerState,
	OwnershipLogEntry,
} from "./types/ownershipConsumer.js";

/** A release only takes effect when it names the worker that currently holds the
 *  partition. Without that check a worker letting go of a claim it had already
 *  lost would evict whoever took it over, which is why releasing used to be
 *  guarded so tightly that stale claims were never withdrawn at all. Releases
 *  written before the claimant was recorded carry no endpoint and keep their
 *  original unconditional behaviour. */
function releaseApplies({
	record,
	current,
}: {
	record: OwnershipRecord;
	current: PartitionOwner | undefined;
}): boolean {
	if (record.type !== "unowned") return false;
	if (record.endpoint === undefined) return true;
	return current?.endpoint === record.endpoint;
}

export function applyOwnershipMessage({
	state,
	message,
	partition,
	offset,
}: {
	state: OwnershipConsumerState;
	message: { key: Buffer | null; value: Buffer | null };
	partition: number;
	offset: bigint;
}): void {
	const previous = state.lastAppliedOffsets.get(partition);
	if (previous !== undefined && previous >= offset) return;
	const record = parseOwnershipRecordIfKnown(message);
	if (record === null) {
		state.lastAppliedOffsets.set(partition, offset);
		return;
	}
	if (record.partition !== partition)
		throw new Error("Ownership record does not match its Kafka partition");
	if (record.type === "claimed") {
		state.owners.set(partition, {
			partition,
			endpoint: record.endpoint,
			routeEpoch: offset.toString(),
		});
	} else if (releaseApplies({ record, current: state.owners.get(partition) })) {
		state.owners.delete(partition);
	}
	// The offset advances even for a release that was ignored or a handoff signal
	// (`ready`, `draining`) that only workers act on, so replay does not keep
	// reconsidering a settled record.
	state.lastAppliedOffsets.set(partition, offset);
}

export async function readOwnershipToEnd({
	log,
	fromOffsetByPartition,
}: {
	log: OwnershipLog;
	fromOffsetByPartition: ReadonlyMap<number, bigint>;
}): Promise<{
	entries: OwnershipLogEntry[];
	nextOffsetByPartition: Map<number, bigint>;
}> {
	const highWatermarks = await log.fetchHighWatermarks();
	const entries: OwnershipLogEntry[] = [];
	const nextOffsetByPartition = new Map(fromOffsetByPartition);

	for (const [partition, highWatermark] of highWatermarks) {
		const fromOffset = fromOffsetByPartition.get(partition) ?? 0n;
		if (fromOffset >= highWatermark) {
			nextOffsetByPartition.set(partition, fromOffset);
			continue;
		}

		const records = await log.readRange({
			partition,
			fromOffset,
			toOffset: highWatermark,
		});
		for (const item of records) {
			entries.push({
				partition: item.partition,
				offset: item.offset,
				record: ownershipTopic.parse({
					key: item.key,
					value: item.value,
				}),
			});
		}
		nextOffsetByPartition.set(partition, highWatermark);
	}

	return { entries, nextOffsetByPartition };
}

export function applyOwnershipRecord({
	owners,
	record,
	offset,
}: {
	owners: ReadonlyMap<number, PartitionOwner>;
	record: OwnershipRecord;
	offset: bigint;
}): Map<number, PartitionOwner> {
	const next = new Map(owners);
	const current = next.get(record.partition);
	if (current && offset <= BigInt(current.routeEpoch)) return next;
	if (record.type === "claimed") {
		next.set(record.partition, {
			partition: record.partition,
			endpoint: record.endpoint,
			routeEpoch: offset.toString(),
		});
	} else if (releaseApplies({ record, current })) {
		next.delete(record.partition);
	}
	return next;
}
