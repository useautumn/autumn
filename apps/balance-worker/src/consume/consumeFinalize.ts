import type { FinalizeCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedCommand } from "./types/queuedCommand.js";

/** A queued finalize: settle the lock in arrival order. A lock already closed or never open settles at the stream's boundary. */
export async function consumeFinalize({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor">;
	command: FinalizeCommand;
}): Promise<QueuedCommand> {
	const decided = await ctx.processor.decideFinalize({ command });
	return { decided };
}
