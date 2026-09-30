import type { ByocCacheEntry } from "../../cacheEntries/types/byocCacheEntry.js";

/** `stale`: the stored entry is from a later log offset, so this one was dropped. */
export type ByocCacheWriteResult = "written" | "stale";

/** Where entries go: the KV of one org env's cache deployment. */
export type ByocCacheWriter = {
	write(params: {
		deploymentId: string;
		key: string;
		entry: ByocCacheEntry;
	}): Promise<ByocCacheWriteResult>;
};
