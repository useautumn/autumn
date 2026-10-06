import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { pushSubjectToCache } from "./pushSubjectToCache/pushSubjectToCache.js";
import type { CachePushContext } from "./types/cachePushContext.js";
import { recordsToCacheSubjects } from "./utils/recordsToCacheSubjects.js";

/** Subjects in a slice are distinct, so they push independently; one at a time capped herald at ~1/push latency per partition. */
export const CACHE_PUSH_CONCURRENCY = 16;
/** A slice holds a few subjects and each push is a read plus a round trip, so throughput scales with partitions in flight. */
export const CACHE_PUSH_PARTITIONS_CONCURRENTLY = 32;

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
		const subjects = recordsToCacheSubjects({ records });
		let next = 0;
		const pushNext = async (): Promise<void> => {
			for (let index = next++; index < subjects.length; index = next++)
				await pushSubjectToCache({ ctx, cacheSubject: subjects[index] });
		};
		await Promise.all(
			Array.from(
				{ length: Math.min(CACHE_PUSH_CONCURRENCY, subjects.length) },
				pushNext,
			),
		);
	}

	return {
		name: "cache-push",
		partitionsConsumedConcurrently: CACHE_PUSH_PARTITIONS_CONCURRENTLY,
		handle,
	};
}
