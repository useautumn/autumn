import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";
import { enterRuntimeRecovery } from "./enterRuntimeRecovery.js";

/**
 * Writes this owner's fence marker into the partition and reads up to it.
 * Under a one-trip commit the claim alone fences nothing: a predecessor that
 * has not noticed it lost the partition can still append. Once the marker is
 * in the log every reader drops lower epochs written after it, and once this
 * runtime has read the marker its state holds everything written before it.
 * A producer with nothing to write (a transactional one, or no epoch yet)
 * makes this a no-op.
 */
export async function fenceRuntime({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (state.status !== "ready")
		throw new OwnedPartitionNotReadyError({ status: state.status });
	const { topic, partition } = ctx.config;
	const signal = state.startupAbortController.signal;
	try {
		const fenced = await ctx.producer.fenceOwnership?.();
		if (!fenced) return;
		await ctx.follower.awaitNextOffset?.({
			topic,
			partition,
			nextOffset: fenced.offset + 1n,
			signal,
		});
	} catch (cause) {
		if (state.terminalError) throw state.terminalError;
		throw await enterRuntimeRecovery({ ctx, state, cause });
	}
}
