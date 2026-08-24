import type {
	Command,
	CommandResult,
} from "../../../../client/types/command.js";
import { LedgerNotImplementedError } from "../../../lib/ledgerNotImplementedError.js";

export const toErrorResult = ({
	command,
	error,
}: {
	command: Command;
	error: unknown;
}): CommandResult => ({
	id: command.id,
	status: error instanceof LedgerNotImplementedError ? 501 : 500,
	body: {
		message: error instanceof Error ? error.message : "ledger: command failed",
	},
});
