import type { EvictCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";

/** A queued evict: drop the customer's copy once the store holds its earlier writes. Failures go to the stream's boundary. */
export async function consumeEvict({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor">;
	command: EvictCommand;
}): Promise<void> {
	await ctx.processor.evict({ command });
}
