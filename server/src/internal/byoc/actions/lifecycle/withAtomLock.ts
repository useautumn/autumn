import type { ByocCacheDeployment } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import { CACHE_LOCK_TTL_MS, cacheLockKey } from "../../utils/byocCacheUtils.js";

/** Holds the named Atom's own lock, so a change to one Atom never waits on another's, and hands over its row as stored now; null when the env has no such Atom. */
export const withAtomLock = async <T>({
	ctx,
	atomId,
	fn,
}: {
	ctx: AutumnContext;
	atomId?: string;
	fn: (cacheDeployment: ByocCacheDeployment | null) => Promise<T>;
}): Promise<T> => {
	const resolved = await cacheDeploymentRepo.find({ ctx, atomId });
	if (!resolved) return fn(null);
	return withLock({
		lockKey: cacheLockKey({ ctx, atomId: resolved.id }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"A change to this Atom is already in progress, try again in a few seconds",
		fn: async () =>
			fn(await cacheDeploymentRepo.findById({ ctx, id: resolved.id })),
	});
};
