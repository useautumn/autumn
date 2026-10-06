import type { HeldSubject } from "../../types/heldSubject.js";
import type { StoredSubject } from "../../types/storedSubject.js";

/** Parsed subjects one thread keeps, least recently read dropped first once their row text passes the budget. */
export type HeldSubjects = {
	get(key: string): StoredSubject | undefined;
	hold(params: { key: string } & HeldSubject): void;
	/** Drops every subject whose key starts with the prefix: a store that closes takes its copies with it. */
	dropPrefix(prefix: string): void;
	readonly bytes: number;
};
