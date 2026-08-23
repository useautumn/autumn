import type { Command } from "../../../../../client/types/command.js";
import { LedgerNotImplementedError } from "../../../../lib/ledgerNotImplementedError.js";
import type { CommandOutcome } from "../../../shard/types/commandOutcome.js";
import type { ShardContext } from "../../../shard/types/shardContext.js";

// The track fold: resolve features, apply the deduction, emit the ledger entry.
export const runTrack = (_params: {
	ctx: ShardContext;
	command: Command;
}): CommandOutcome => {
	throw new LedgerNotImplementedError("track fold");
};
