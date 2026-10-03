import type { UpdateBalanceCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedDecision } from "./types/queuedDecision.js";

/** A queued balance update: decide it in arrival order, say when the rows already held it. Its commit settles with the consumed batch. */
export async function consumeUpdateBalance({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor" | "logger">;
	command: UpdateBalanceCommand;
}): Promise<QueuedDecision | undefined> {
	const decided = await ctx.processor.decideUpdateBalance({ command });
	if (decided.kind !== "reply") return decided;
	ctx.logger?.info("Queued update balance changed nothing", {
		commandId: command.commandId,
		customerId: command.identity.customerId,
		featureId: command.featureId,
	});
	return undefined;
}
