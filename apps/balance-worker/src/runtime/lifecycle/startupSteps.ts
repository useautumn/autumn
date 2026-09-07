import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type {
	PartitionOutcomeFollowerPort,
	RuntimeFailure,
} from "../types/partitionRuntime.js";
import type {
	PartitionRuntimeScope,
	PartitionRuntimeState,
} from "../types/partitionRuntimeState.js";
import {
	stopPreparationInBackground,
	stopRuntimePreparation,
} from "./disposeRuntimeResources.js";
import { enterRuntimeRecovery } from "./enterRuntimeRecovery.js";

export async function completeRuntimeStartup({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	const { topic, partition } = ctx.config;
	const signal = state.startupAbortController.signal;

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

		state.status = "bootstrapping";
		const logRange = await ctx.follower.readLogRange({
			topic,
			partition,
			signal,
		});
		assertStartupContinues({ state });
		await ctx.bootstrapper.bootstrap({ topic, partition, logRange, signal });
		assertStartupContinues({ state });

		state.status = "catching_up";
		state.followerStartAttempted = true;
		await ctx.follower.startAndCatchUp({
			topic,
			partition,
			targetNextOffset: logRange.logEndOffset,
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

export async function completeRuntimePreparation({
	ctx,
	state,
	follower,
}: PartitionRuntimeScope & {
	follower: PartitionOutcomeFollowerPort;
}): Promise<void> {
	const { topic, partition } = ctx.config;
	const signal = state.startupAbortController.signal;

	function onUnavailable({ cause }: RuntimeFailure): void {
		if (state.status !== "preparing") return;
		state.startupAbortController.abort(cause);
		void stopPreparationInBackground({ state });
	}

	try {
		const logRange = await follower.readLogRange({ topic, partition, signal });
		signal.throwIfAborted();
		await ctx.bootstrapper.bootstrap({ topic, partition, logRange, signal });
		signal.throwIfAborted();
		await follower.startAndCatchUp({
			topic,
			partition,
			targetNextOffset: logRange.logEndOffset,
			onUnavailable,
		});
		signal.throwIfAborted();
		await stopRuntimePreparation({ state });
		signal.throwIfAborted();
		state.status = "prepared";
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
	if (
		state.status !== "fencing" &&
		state.status !== "bootstrapping" &&
		state.status !== "catching_up"
	) {
		throw new OwnedPartitionNotReadyError({ status: state.status });
	}
}
