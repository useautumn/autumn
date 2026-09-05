import { ownershipTopic } from "../ownershipTopic.js";
import type { OwnershipLog } from "../types/ownershipLog.js";
import type { OwnershipRecord } from "../types/ownershipRecord.js";
import type { PartitionOwner } from "../types/partitionOwner.js";
import type { OwnershipLogEntry } from "./types/ownershipConsumer.js";

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
	} else {
		next.delete(record.partition);
	}
	return next;
}
