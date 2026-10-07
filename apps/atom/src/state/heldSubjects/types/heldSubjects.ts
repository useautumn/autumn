import type { HeldSubject } from "../../types/heldSubject.js";

/** Parsed subjects one thread keeps, least recently read dropped first once their row text passes the budget. */
export type HeldSubjects = {
	get(key: string): HeldSubject | undefined;
	hold(params: { key: string } & HeldSubject): void;
	/** Drops every subject whose key starts with the prefix: a store that closes takes its copies with it. */
	dropPrefix(prefix: string): void;
	readonly size: number;
	readonly bytes: number;
	/** Lookups since boot, and how many found nothing held: the misses are what read and parse a row. */
	readonly lookups: number;
	readonly misses: number;
};
