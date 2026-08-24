import type { LedgerEntry } from "../../../api/journal/types/ledgerEntry.js";

export interface Journal {
	append(params: { entries: LedgerEntry[] }): Promise<void>;
}
