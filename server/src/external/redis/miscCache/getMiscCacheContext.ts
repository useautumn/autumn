import type { ReadThroughCacheContext } from "@autumn/cache";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscCache } from "./getMiscCache.js";

let miscCacheContext: ReadThroughCacheContext | undefined;

/** The server's ctx for `@autumn/cache` actions: its misc cache and its logger, built once. */
export const getMiscCacheContext = (): ReadThroughCacheContext => {
	miscCacheContext ??= { miscCache: getMiscCache(), logger };
	return miscCacheContext;
};
