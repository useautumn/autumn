import type {
	EvictCommand,
	ResetCommand,
	TrackCommand,
} from "@autumn/balance-engine";
import { enqueueCommands } from "./enqueueCommands.js";
import type { CommandQueue, QueueContext } from "./types/queue.js";

/** One typed door per queued command; each is the same append underneath. */
export function createCommandQueue({
	ctx,
}: {
	ctx: QueueContext;
}): CommandQueue {
	function track({
		commands,
		signal,
	}: {
		commands: readonly TrackCommand[];
		signal?: AbortSignal;
	}) {
		return enqueueCommands({ ctx, commands, signal });
	}

	function reset({
		commands,
		signal,
	}: {
		commands: readonly ResetCommand[];
		signal?: AbortSignal;
	}) {
		return enqueueCommands({ ctx, commands, signal });
	}

	function evict({
		commands,
		signal,
	}: {
		commands: readonly EvictCommand[];
		signal?: AbortSignal;
	}) {
		return enqueueCommands({ ctx, commands, signal });
	}

	return { track, reset, evict };
}
