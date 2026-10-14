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

export const CACHE_PUSH_CONCURRENCY = 64;
export const CACHE_PUSH_LINGER_MS = 50;
export const CACHE_PUSH_MAX_PENDING = 20_000;

export function createCachePushConsumer({
	ctx,
}: {
	ctx: CachePushContext;
}): StreamConsumer {
	const queue = createCachePushQueue({
		push: pushAndRecord,
		concurrency: CACHE_PUSH_CONCURRENCY,
		maxPending: CACHE_PUSH_MAX_PENDING,
		lingerMs: CACHE_PUSH_LINGER_MS,
	});
	const stats = createCachePushStats({
		logger: ctx.logger,
		queueDepth: () => ({
			pending: queue.pendingCount(),
			active: queue.activeCount(),
		}),
	});

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

	return { name: "cache-push", handle, stop: () => queue.drain() };
}
