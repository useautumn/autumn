import type { ByocCacheEntry } from "../../cacheEntries/types/byocCacheEntry.js";

export type ByocCacheWriteResult = "written" | "stale";

export type ByocCacheWriter = {
	write(params: {
		deploymentId: string;
		key: string;
		entry: ByocCacheEntry;
	}): Promise<ByocCacheWriteResult>;
};
