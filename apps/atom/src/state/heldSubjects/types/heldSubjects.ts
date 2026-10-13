import type { HeldSubject } from "../../types/heldSubject.js";

/** Parsed subjects one thread keeps: least recently read dropped first once their row text passes the budget, idle ones dropped as they age. */
export type HeldSubjects = {
	get(key: string): HeldSubject | undefined;
	hold(params: { key: string } & HeldSubject): void;
	/** Drops one subject, as when its row leaves the file; false when nothing was held under the key. */
	drop(key: string): boolean;
	/** Drops every subject whose key starts with the prefix: a store that closes takes its copies with it. */
	dropPrefix(prefix: string): void;
	/** Drops a bounded number of the least recent subjects idle past the expiry; a hold does this too, so a tick only covers a quiet thread. */
	expireIdle(): void;
	readonly size: number;
	readonly bytes: number;
	/** Lookups since boot, and how many found nothing held: the misses are what read and parse a row. */
	readonly lookups: number;
	readonly misses: number;
	/** Subjects dropped since boot for the budget, and for sitting idle. */
	readonly evicted: number;
	readonly expired: number;
};
