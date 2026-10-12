import { meteringIdentityToSubjectKey } from "@autumn/balance-engine";
import type { StreamRecord } from "../../../stream/types/streamConsumer.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { mergeCacheSubjects } from "./mergeCacheSubjects.js";
import { recordToCacheSubjects } from "./recordToCacheSubjects.js";

/** Each subject the batch moved once, merged across its records. */
export const recordsToCacheSubjects = ({
	records,
}: {
	records: StreamRecord[];
}): CacheSubjectRef[] => {
	const bySubjectKey = new Map<string, CacheSubjectRef>();
	for (const streamRecord of records)
		for (const next of recordToCacheSubjects(streamRecord)) {
			const key = meteringIdentityToSubjectKey({ identity: next.identity });
			bySubjectKey.set(
				key,
				mergeCacheSubjects({ held: bySubjectKey.get(key), next }),
			);
		}
	return [...bySubjectKey.values()];
};
