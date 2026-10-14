import type { CacheLogger } from "../../client/types/redisClient.js";
import type { MiscCache } from "./miscCache.js";

export type ReadThroughCacheContext = {
	miscCache: Pick<MiscCache, "resolve" | "forEachTarget">;
	logger: CacheLogger;
};
