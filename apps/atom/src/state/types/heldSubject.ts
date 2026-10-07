import type { StoredSubject } from "./storedSubject.js";

/** A subject as held in memory, with the size of the row text it came from (what the held budget counts) and its slice's hash. */
export type HeldSubject = {
	subject: StoredSubject;
	bytes: number;
	sliceHash: string;
};
