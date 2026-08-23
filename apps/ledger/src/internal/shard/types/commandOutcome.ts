import type { CommandResult } from "../../../../client/types/command.js";
import type { LedgerEntry } from "../../journal/types/ledgerEntry.js";

// A fold produces both the caller's reply and the entry the journal must carry.
export type CommandOutcome = {
	result: CommandResult;
	entry?: LedgerEntry;
};
