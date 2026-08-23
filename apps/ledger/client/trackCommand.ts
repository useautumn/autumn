import {
	type Command,
	type CommandResult,
	CommandResultBatchSchema,
} from "./types/command.js";
import type { LedgerClientContext } from "./types/ledgerClient.js";

export const trackCommand = async ({
	ctx,
	command,
}: {
	ctx: LedgerClientContext;
	command: Command;
}): Promise<CommandResult> => {
	const response = await fetch(new URL("/commands", ctx.baseUrl), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify([command]),
		signal: AbortSignal.timeout(ctx.timeoutMs),
	});

	const [result] = CommandResultBatchSchema.parse(await response.json());
	if (!result) throw new Error("ledger: empty command result batch");
	return result;
};
