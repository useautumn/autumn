import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type { RuntimeFailure } from "../types/partitionRuntime.js";
import type {
	PartitionRuntimeScope,
	PartitionRuntimeState,
} from "../types/partitionRuntimeState.js";
import { enterRuntimeRecovery } from "./enterRuntimeRecovery.js";

export async function completeRuntimeStartup({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	const { topic, partition } = ctx.config;

	function onUnavailable({ cause }: RuntimeFailure): void {
		if (
			state.status === "draining" ||
			state.status === "stopped" ||
			state.status === "recovery_required"
		)
			return;
		void enterRuntimeRecovery({ ctx, state, cause, drainAcceptedWork: true });
	}

	try {
		state.producerConnectionAttempted = true;
		await ctx.producer.connect();
		assertStartupContinues({ state });
		await ctx.producer.fence();
		assertStartupContinues({ state });

		state.followerStartAttempted = true;
		await ctx.follower.startAndCatchUp({
			topic,
			partition,
			onUnavailable,
		});
		assertStartupContinues({ state });
		state.status = "ready";
	} catch (cause) {
		if (state.terminalError) throw state.terminalError;
		if (state.status === "draining")
			throw new OwnedPartitionNotReadyError({ status: state.status });
		throw await enterRuntimeRecovery({ ctx, state, cause });
	}
}

function assertStartupContinues({
	state,
}: {
	state: PartitionRuntimeState;
}): void {
	if (state.terminalError) throw state.terminalError;
	if (state.status !== "starting") {
		throw new OwnedPartitionNotReadyError({ status: state.status });
	}
}
