import type { HeldSubject } from "../../types/heldSubject.js";
import type { StoredSubject } from "../../types/storedSubject.js";

/**
 * Subjects one thread keeps as row text, least recently read dropped first once the text passes the budget, idle ones
 * dropped as they age; and, under a smaller budget, the parsed copies of the ones it keeps deciding on.
 */
export type HeldSubjects = {
	get(key: string): HeldSubject | undefined;
	/** Holds the text, and its parsed copy when given one. */
	hold(params: { key: string } & HeldSubject): void;
	/** Keeps a held text's parsed copy; the coldest parsed copies are let go past the parsed budget, their text kept. */
	keepParsed(params: { key: string; subject: StoredSubject }): void;
	/** A catalog slice's text by hash, shared by every customer on the plan; what a text's parse reads it from. */
	sliceOf(hash: string): { catalogJson: string; orgJson: string } | undefined;
	holdSlice(params: {
		hash: string;
		catalogJson: string;
		orgJson: string;
	}): void;
	/** Drops one subject, as when its row leaves the file; false when nothing was held under the key. */
	drop(key: string): boolean;
	/** Drops every subject whose key starts with the prefix: a store that closes takes its copies with it. */
	dropPrefix(prefix: string): void;
	/** Drops a bounded number of the least recent subjects idle past the expiry; a hold does this too, so a tick only covers a quiet thread. */
	expireIdle(): void;
	readonly size: number;
	readonly bytes: number;
	/** How many of the held subjects are parsed now, and their text bytes. */
	readonly parsedSize: number;
	readonly parsedBytes: number;
	/** Lookups since boot, and how many found nothing held: the misses are what read a row from the file. */
	readonly lookups: number;
	readonly misses: number;
	/** Texts parsed since boot, on a miss or after the parsed tier let the copy go. */
	readonly parses: number;
	/** Subjects dropped since boot for the budget, and for sitting idle. */
	readonly evicted: number;
	readonly expired: number;
};
