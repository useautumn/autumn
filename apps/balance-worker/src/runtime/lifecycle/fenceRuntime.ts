import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";
import { enterRuntimeRecovery } from "./enterRuntimeRecovery.js";

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
