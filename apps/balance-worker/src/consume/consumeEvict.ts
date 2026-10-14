import type { EvictCommand } from "@autumn/balance-engine";
import type { ConsumeContext } from "./types/consume.js";

export async function consumeEvict({
	ctx,
	command,
}: {
	ctx: Pick<ConsumeContext, "processor">;
	command: EvictCommand;
}): Promise<void> {
	await ctx.processor.evict({ command, waitsForSnapshotDelete: false });
}
