import type { ResetCommand, TrackCommand } from "@autumn/balance-engine";
import { enqueueCommands } from "./enqueueCommands.js";
import type { CommandQueue, QueueContext } from "./types/queue.js";

/** One typed door per queued command; each is the same append underneath. */
export function createCommandQueue({
	ctx,
}: {
	ctx: QueueContext;
}): CommandQueue {
	function track({ commands }: { commands: readonly TrackCommand[] }) {
		return enqueueCommands({ ctx, commands });
	}

	function reset({ commands }: { commands: readonly ResetCommand[] }) {
		return enqueueCommands({ ctx, commands });
	}

	return { track, reset };
}
