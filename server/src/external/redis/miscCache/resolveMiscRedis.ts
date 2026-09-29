import type { MiscCache, MiscCacheTarget } from "@autumn/cache";
import type { Redis } from "ioredis";
import { getMiscCache } from "./getMiscCache.js";

export { getRequestBucket } from "@autumn/cache";

/** Read-through caches only: a ramp slice of requests reads from the ramp target. Locks use `getMiscRedis`. */
export const resolveMiscRedis = (params: { requestId?: string }): Redis =>
	getMiscCache().resolve(params);

export const getMiscRedisTargets = (): MiscCacheTarget[] =>
	getMiscCache().targets();

export const forEachMiscRedisTarget = <T>(
	params: Parameters<MiscCache["forEachTarget"]>[0] & {
		operation: (target: MiscCacheTarget) => Promise<T>;
	},
): Promise<PromiseSettledResult<T>[]> => getMiscCache().forEachTarget(params);
