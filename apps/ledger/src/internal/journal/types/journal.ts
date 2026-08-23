import type { LedgerEntry } from "./ledgerEntry.js";

export interface Journal {
	append(params: { entries: LedgerEntry[] }): Promise<void>;
}
