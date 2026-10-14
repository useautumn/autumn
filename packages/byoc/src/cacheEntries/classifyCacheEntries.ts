import type { ByocCacheEntry } from "./types/byocCacheEntry.js";

export const isNewerCacheEntry = ({
	incoming,
	stored,
}: {
	incoming: ByocCacheEntry;
	stored: ByocCacheEntry | null;
}): boolean =>
	stored === null || BigInt(incoming.log_offset) > BigInt(stored.log_offset);
