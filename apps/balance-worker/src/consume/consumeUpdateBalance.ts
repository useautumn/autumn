import type { UpdateBalanceCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";

/** A queued balance update: run it, say when the rows already held it. Refusals, paid allocated included, settle at the stream's boundary. */
export async function consumeUpdateBalance({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor" | "logger">;
	command: UpdateBalanceCommand;
}): Promise<void> {
	const reply = await ctx.processor.updateBalance({ command });
	if (reply.result === null)
		ctx.logger?.info("Queued update balance changed nothing", {
			commandId: command.commandId,
			customerId: command.identity.customerId,
			featureId: command.featureId,
		});
}
