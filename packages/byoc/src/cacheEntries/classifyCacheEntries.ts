import type { ByocCacheEntry } from "./types/byocCacheEntry.js";

/** The one ordering rule every writer applies: an entry replaces what is stored only from a later log offset. */
export const isNewerCacheEntry = ({
	incoming,
	stored,
}: {
	incoming: ByocCacheEntry;
	stored: ByocCacheEntry | null;
}): boolean =>
	stored === null || BigInt(incoming.log_offset) > BigInt(stored.log_offset);
