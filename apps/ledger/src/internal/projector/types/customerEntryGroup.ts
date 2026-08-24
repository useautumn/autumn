import type { LedgerEntry } from "../../../api/journal/types/ledgerEntry.js";

export type DecodedEntry = {
	entry: LedgerEntry;
	offset: number;
};

// One customer's entries from a single batch, in log order — the unit that
// gets one Postgres transaction.
export type CustomerEntryGroup = {
	internalCustomerId: string;
	entries: DecodedEntry[];
};
