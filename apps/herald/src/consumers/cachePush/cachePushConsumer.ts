import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { pushSubjectToCache } from "./pushSubjectToCache/pushSubjectToCache.js";
import type { CachePushContext } from "./types/cachePushContext.js";
import { recordsToCacheSubjects } from "./utils/recordsToCacheSubjects.js";

/** Keeps each org's BYOC cache current: every subject a batch moved is re-read from its worker and written as it now stands. */
export function createCachePushConsumer({
	ctx,
}: {
	ctx: CachePushContext;
}): StreamConsumer {
	async function handle({
		records,
	}: {
		records: StreamRecord[];
	}): Promise<void> {
		for (const cacheSubject of recordsToCacheSubjects({ records }))
			await pushSubjectToCache({ ctx, cacheSubject });
	}

	return { name: "cache-push", handle };
}
