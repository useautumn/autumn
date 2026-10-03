import type { UpdateBalanceCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedCommand } from "./types/queuedCommand.js";

/** A queued balance update: decide it in arrival order. Null when the rows already held it, so there is no record to commit. */
export async function consumeUpdateBalance({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor" | "logger">;
	command: UpdateBalanceCommand;
}): Promise<QueuedCommand | null> {
	const decided = await ctx.processor.decideUpdateBalance({ command });
	if (decided.kind !== "reply") return { decided };
	ctx.logger?.info("Queued update balance changed nothing", {
		commandId: command.commandId,
		customerId: command.identity.customerId,
		featureId: command.featureId,
	});
	return null;
}
