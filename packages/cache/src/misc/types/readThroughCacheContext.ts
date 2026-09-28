import type { CacheLogger } from "../../client/types/redisClient.js";
import type { MiscCache } from "./miscCache.js";

/** A read-through family: a miss recomputes from Postgres, so reads may ramp and invalidations hit every target. */
export type ReadThroughCacheContext = {
	miscCache: Pick<MiscCache, "resolve" | "forEachTarget">;
	logger: CacheLogger;
};
