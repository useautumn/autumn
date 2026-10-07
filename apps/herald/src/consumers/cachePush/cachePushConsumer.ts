import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { createCachePushQueue } from "./pushQueue/createCachePushQueue.js";
import { createCachePushStats } from "./pushQueue/createCachePushStats.js";
import { pushSubjectToCache } from "./pushSubjectToCache/pushSubjectToCache.js";
import type { CachePushContext } from "./types/cachePushContext.js";
import type { CacheSubjectRef } from "./types/cacheSubjectRef.js";
import { recordsToCacheSubjects } from "./utils/recordsToCacheSubjects.js";

/** Pushes in flight per herald task: each is a worker read plus an Atom write, so throughput is concurrency over latency. */
export const CACHE_PUSH_CONCURRENCY = 64;
/** Subjects waiting before a slice blocks, so the log is not read far ahead of what reached the Atoms. */
export const CACHE_PUSH_MAX_PENDING = 20_000;

/**
 * Keeps each org's BYOC cache current: every subject a batch moved is re-read from its worker and written as it now stands.
 * A slice only queues its subjects; the pushes run on their own pool, so a slow push never holds a partition's next fetch.
 * Out-of-order pushes are safe: the Atom keeps the newest subject by read_at, then log_offset.
 */
export function createCachePushConsumer({
	ctx,
}: {
	ctx: CachePushContext;
}): StreamConsumer {
	const queue = createCachePushQueue({
		push: pushAndRecord,
		concurrency: CACHE_PUSH_CONCURRENCY,
		maxPending: CACHE_PUSH_MAX_PENDING,
	});
	const stats = createCachePushStats({
		logger: ctx.logger,
		queueDepth: () => ({
			pending: queue.pendingCount(),
			active: queue.activeCount(),
		}),
	});

	/** A subject that fails is logged and dropped: its Atom copy stays stale until the subject next changes. */
	async function pushAndRecord({
		cacheSubject,
	}: {
		cacheSubject: CacheSubjectRef;
	}): Promise<void> {
		const startedAt = performance.now();
		try {
			const timing = await pushSubjectToCache({ ctx, cacheSubject });
			if (timing)
				stats.recordPush({
					...timing,
					totalMs: performance.now() - startedAt,
					ageMs: Date.now() - cacheSubject.oldestOccurredAt,
				});
			else stats.recordSkip();
		} catch (error) {
			stats.recordFailure();
			ctx.logger.warn(
				{
					error,
					type: "herald_cache_push_failed",
					data: { logOffset: cacheSubject.logOffset.toString() },
				},
				"A subject could not be pushed to its Atoms; it is pushed again when it next changes",
			);
		}
	}

	async function handle({
		records,
	}: {
		records: StreamRecord[];
	}): Promise<void> {
		const subjects = recordsToCacheSubjects({ records });
		const now = Date.now();
		for (const { oldestOccurredAt } of subjects)
			stats.recordEnqueue({ ageMs: now - oldestOccurredAt });
		queue.enqueue({ subjects });
		await queue.waitForRoom();
	}

	// Each slice's offsets are committed once it is queued, so a push still queued at stop would never be read again.
	return { name: "cache-push", handle, stop: () => queue.drain() };
}
