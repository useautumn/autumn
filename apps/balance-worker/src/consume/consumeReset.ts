import type { ResetCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedCommand } from "./types/queuedCommand.js";

export async function consumeReset({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor" | "logger">;
	command: ResetCommand;
}): Promise<QueuedCommand | null> {
	const decided = await ctx.processor.decideReset({ command });
	if (decided.kind !== "reply") return { decided };
	ctx.logger?.info("Queued reset found nothing due", {
		commandId: command.commandId,
		customerId: command.identity.customerId,
	});
	return null;
}
