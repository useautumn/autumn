import { createMemoryJournal } from "./createMemoryJournal.js";
import type { Journal } from "./types/journal.js";

let journal: Journal | undefined;

// Memory-backed until the Redpanda producer is built.
export const getJournal = (): Journal => {
	journal ??= createMemoryJournal();
	return journal;
};
