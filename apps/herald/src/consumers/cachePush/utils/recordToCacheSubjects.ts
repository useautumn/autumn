import type { StreamRecord } from "../../../stream/types/streamConsumer.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";

export const recordToCacheSubjects = ({
	position,
	record,
}: StreamRecord): CacheSubjectRef[] => {
	const at = {
		logOffset: position.offset,
		oldestOccurredAt: record.command.occurredAt,
	};
	const isEvict = record.command.type === "evict";
	const customer: CacheSubjectRef = {
		...at,
		identity: { ...record.identity, entityId: null },
		customerVersion: isEvict ? position.offset : null,
	};
	if (!record.identity.entityId) return [customer];
	return [
		{ ...at, identity: record.identity, customerVersion: null },
		customer,
	];
};
