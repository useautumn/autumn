import type { StoredSubject } from "../types/storedSubject.js";
import type { JournalEntry } from "./types/journal.js";

/** The seqs of the entries a stored push shows Autumn has applied. None yet: the drop rule comes with the forwarder. */
export const commandsSeenBy = (_params: {
	owed: readonly JournalEntry[];
	subject: StoredSubject;
}): number[] => [];
