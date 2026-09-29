import type { ByocCacheEntry } from "@autumn/byoc";
import type { CachePushContext } from "../types/cachePushContext.js";

/** Into the org's KV; until a writer exists, the built entry is logged as skipped. */
export const writeCacheEntry = async ({
	ctx,
	deploymentId,
	key,
	entry,
}: {
	ctx: CachePushContext;
	deploymentId: string;
	key: string;
	entry: ByocCacheEntry;
}): Promise<void> => {
	if (!ctx.cacheWriter) {
		ctx.logger.debug(
			{ type: "herald_cache_push_skipped", data: { key } },
			"No cache writer yet; the entry was built and not written",
		);
		return;
	}
	await ctx.cacheWriter.write({ deploymentId, key, entry });
};
