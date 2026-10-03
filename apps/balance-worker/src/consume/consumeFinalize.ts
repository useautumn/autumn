import type { FinalizeCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";

/** A queued finalize: settle the lock, say when the balance refused its final value. A lock already closed or never open settles at the stream's boundary. */
export async function consumeFinalize({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor" | "logger">;
	command: FinalizeCommand;
}): Promise<void> {
	const reply = await ctx.processor.finalize({ command });
	if (reply.result.status !== "applied")
		ctx.logger?.warn("Queued finalize rejected by the balance", {
			commandId: command.commandId,
			customerId: command.identity.customerId,
			featureId: command.lock.feature_id,
			reason: reply.result.reason,
		});
}
