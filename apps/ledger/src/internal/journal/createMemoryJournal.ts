import type { LedgerEntry } from "../../api/journal/types/ledgerEntry.js";
import type { Journal } from "./types/journal.js";

export type MemoryJournal = Journal & { readonly entries: LedgerEntry[] };

export const createMemoryJournal = (): MemoryJournal => {
	const entries: LedgerEntry[] = [];

	const append = ({
		entries: appended,
	}: {
		entries: LedgerEntry[];
	}): Promise<void> => {
		for (const entry of appended) entries.push(entry);
		return Promise.resolve();
	};

	return { entries, append };
};
