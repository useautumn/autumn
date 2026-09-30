import { meteringIdentityToSubjectKey } from "@autumn/balance-engine";
import type { StreamRecord } from "../../../stream/types/streamConsumer.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";

/** Each subject once, at its latest offset; an entity's record moves its customer's balances too. */
export const recordsToCacheSubjects = ({
	records,
}: {
	records: StreamRecord[];
}): CacheSubjectRef[] => {
	const latestBySubjectKey = new Map<string, CacheSubjectRef>();
	for (const { position, record } of records) {
		const customerIdentity = { ...record.identity, entityId: null };
		const identities = record.identity.entityId
			? [record.identity, customerIdentity]
			: [customerIdentity];
		for (const identity of identities)
			latestBySubjectKey.set(meteringIdentityToSubjectKey({ identity }), {
				identity,
				logOffset: position.offset,
			});
	}
	return [...latestBySubjectKey.values()];
};
