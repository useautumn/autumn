import type { StreamRecord } from "../../../stream/types/streamConsumer.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";

/** The subjects one record moved, at its offset: its entity if it has one, and always its customer, whose balances any change moves. */
export const recordToCacheSubjects = ({
	position,
	record,
}: StreamRecord): CacheSubjectRef[] => {
	const at = {
		logOffset: position.offset,
		oldestOccurredAt: record.command.occurredAt,
	};
	// An evict names no rows, so it may have replaced any entity's: the customer's version moves to its offset.
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
