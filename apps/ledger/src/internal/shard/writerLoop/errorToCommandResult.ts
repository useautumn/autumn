import { RecaseError } from "@autumn/shared";
import type { Command } from "../../../api/types/command.js";
import type { CommandResult } from "../../../api/types/commandResult.js";
import { LedgerNotImplementedError } from "../../../lib/ledgerNotImplementedError.js";

const NOT_IMPLEMENTED = 501;
const INTERNAL_ERROR = 500;

const errorToStatus = ({ error }: { error: unknown }): number => {
	if (error instanceof RecaseError) return error.statusCode;
	if (error instanceof LedgerNotImplementedError) return NOT_IMPLEMENTED;
	return INTERNAL_ERROR;
};

export const errorToCommandResult = ({
	command,
	error,
}: {
	command: Command;
	error: unknown;
}): CommandResult => ({
	id: command.id,
	status: errorToStatus({ error }),
	body: {
		code: error instanceof RecaseError ? error.code : "ledger_error",
		message: error instanceof Error ? error.message : "ledger: command failed",
	},
});
