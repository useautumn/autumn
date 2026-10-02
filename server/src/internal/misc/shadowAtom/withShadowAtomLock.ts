import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import { CACHE_LOCK_TTL_MS } from "@/internal/byoc/utils/byocCacheUtils.js";

/** One deployment change at a time, as for a customer's cache. */
export const withShadowAtomLock = <T>({
	fn,
}: {
	fn: () => Promise<T>;
}): Promise<T> =>
	withLock({
		lockKey: "lock:shadow-atom",
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage: "A shadow Atom change is already running.",
		fn,
	});
