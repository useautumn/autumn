import type { ResetCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";

/** A queued reset: run it, say whether anything was due. Failures go to the stream's boundary. */
export async function consumeReset({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor" | "logger">;
	command: ResetCommand;
}): Promise<void> {
	const reply = await ctx.processor.reset({ command });
	if (reply.result === null)
		ctx.logger?.info("Queued reset found nothing due", {
			commandId: command.commandId,
			customerId: command.identity.customerId,
		});
}
