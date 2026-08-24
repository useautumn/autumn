import type { CommandQueue } from "../commandQueue/types/commandQueue.js";
import type { CommandRunner } from "../types/commandRunner.js";
import type { ShardContext } from "../types/shardContext.js";
import { commitOrRollback } from "./commitOrRollback.js";
import { deferUntilResident } from "./deferUntilResident.js";
import { runSlice } from "./runSlice.js";

// Group commit: a slice is everything that arrived during the last append,
// so throughput tracks load and the ack is paid once per slice, not per command.
export const runWriterLoop = async ({
	ctx,
	queue,
	runCommand,
}: {
	ctx: ShardContext;
	queue: CommandQueue;
	runCommand: CommandRunner;
}): Promise<void> => {
	for (;;) {
		const arrived = await queue.take();
		if (arrived.length === 0) return;

		const slice = runSlice({ ctx, arrived, runCommand });
		queue.requeue(slice.deferred);
		deferUntilResident({ ctx, queue, items: slice.awaitingImport });
		await commitOrRollback({ ctx, staged: slice.staged });
	}
};
