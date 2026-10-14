import type { ReadThroughCacheContext } from "@autumn/cache";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscCache } from "./getMiscCache.js";

let miscCacheContext: ReadThroughCacheContext | undefined;

export const getMiscCacheContext = (): ReadThroughCacheContext => {
	miscCacheContext ??= { miscCache: getMiscCache(), logger };
	return miscCacheContext;
};
