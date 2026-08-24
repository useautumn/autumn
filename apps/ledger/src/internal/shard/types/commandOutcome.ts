import type { LedgerEntry } from "../../../api/journal/types/ledgerEntry.js";
import type { CommandResult } from "../../../api/types/commandResult.js";

// A fold produces both the caller's reply and the entry the journal must carry.
export type CommandOutcome = {
	result: CommandResult;
	entry?: LedgerEntry;
};
