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
	// No caller waits for an answer, and the stream is serial: its DELETE lands on the lane behind it, batched with its neighbours'.
	await ctx.processor.evict({ command, waitsForSnapshotDelete: false });
}
