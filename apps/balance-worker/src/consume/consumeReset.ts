import type { ResetCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedDecision } from "./types/queuedDecision.js";

/** A queued reset: decide it in arrival order, say whether anything was due. Its commit settles with the consumed batch. */
export async function consumeReset({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor" | "logger">;
	command: ResetCommand;
}): Promise<QueuedDecision | undefined> {
	const decided = await ctx.processor.decideReset({ command });
	if (decided.kind !== "reply") return decided;
	ctx.logger?.info("Queued reset found nothing due", {
		commandId: command.commandId,
		customerId: command.identity.customerId,
	});
	return undefined;
}
