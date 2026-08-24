import type { MemoryJournal } from "./createMemoryJournal.js";
import type { Journal } from "./types/journal.js";

export const isMemoryJournal = (journal: Journal): journal is MemoryJournal =>
	"entries" in journal;
