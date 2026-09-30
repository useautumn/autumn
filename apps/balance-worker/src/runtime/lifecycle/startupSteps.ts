import { PartitionBootstrapRefusedError } from "../bootstrap/partitionBootstrapErrors.js";
import {
	OwnedPartitionNotReadyError,
	PartitionPreparationFailedError,
} from "../runtimeErrors.js";
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
	prepared,
}: PartitionRuntimeScope & { prepared: boolean }): Promise<void> {
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

		// Activation keeps one status: a command that meets it waits instead of reading each step.
		if (!prepared) state.status = "bootstrapping";
		const logRange = await ctx.follower.readLogRange({
			topic,
			partition,
			signal,
		});
		assertStartupContinues({ state });
		// Bootstrap again after preparation: the bookmark moved while the predecessor drained.
		await ctx.bootstrapper.bootstrap({ topic, partition, logRange, signal });
		assertStartupContinues({ state });

		if (!prepared) state.status = "catching_up";
		state.followerStartAttempted = true;
		await ctx.follower.startAndCatchUp({
			topic,
			partition,
			targetNextOffset: logRange.logEndOffset,
			onUnavailable,
			fromBookmark: prepared,
		});
		assertStartupContinues({ state });
		state.status = "ready";
		function readConsumedNextOffset(): bigint | null {
			return ctx.follower.readProgress({ topic, partition }).consumedNextOffset;
		}
		state.checkpointLease =
			ctx.checkpointMaintenance?.start({
				topic,
				partition,
				signal,
				readConsumedNextOffset,
				onStateFailure: onUnavailable,
			}) ?? null;
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
		const startedAt = performance.now();
		let logRange = await follower.readLogRange({ topic, partition, signal });
		signal.throwIfAborted();
		const bootstrapStartedAt = performance.now();
		try {
			await ctx.bootstrapper.bootstrap({ topic, partition, logRange, signal });
		} catch (cause) {
			// The owner is still writing: its bookmark can pass a log end read a moment earlier.
			if (!isProgressAheadOfLiveLog({ cause })) throw cause;
			logRange = await follower.readLogRange({ topic, partition, signal });
		}
		signal.throwIfAborted();
		const replayStartedAt = performance.now();
		const bookmark = ctx.stateStore.readNextOffset({ topic, partition });
		await follower.startAndCatchUp({
			topic,
			partition,
			targetNextOffset: logRange.logEndOffset,
			onUnavailable,
		});
		signal.throwIfAborted();
		const replayedUntil = performance.now();
		await stopRuntimePreparation({ state });
		signal.throwIfAborted();
		state.status = "prepared";
		logPreparation({
			ctx,
			startedAt,
			bootstrapStartedAt,
			replayStartedAt,
			replayedUntil,
			bookmark,
			logEndOffset: logRange.logEndOffset,
		});
	} catch (cause) {
		if (state.terminalError) throw state.terminalError;
		if (state.status === "draining")
			throw new OwnedPartitionNotReadyError({ status: state.status });
		throw await enterRuntimeRecovery({
			ctx,
			state,
			cause: new PartitionPreparationFailedError({ topic, partition, cause }),
		});
	}
}

/** Where a successor's preparation spent its time, so a slow handoff can be attributed. */
function logPreparation({
	ctx,
	startedAt,
	bootstrapStartedAt,
	replayStartedAt,
	replayedUntil,
	bookmark,
	logEndOffset,
}: {
	ctx: PartitionRuntimeScope["ctx"];
	startedAt: number;
	bootstrapStartedAt: number;
	replayStartedAt: number;
	replayedUntil: number;
	bookmark: bigint | null;
	logEndOffset: bigint;
}): void {
	const { topic, partition } = ctx.config;
	const totalMs = Math.round(performance.now() - startedAt);
	ctx.logger?.info?.(
		{
			event: "balance_worker.partition_prepared",
			data: {
				topic,
				partition,
				totalMs,
				logRangeMs: Math.round(bootstrapStartedAt - startedAt),
				bootstrapMs: Math.round(replayStartedAt - bootstrapStartedAt),
				replayMs: Math.round(replayedUntil - replayStartedAt),
				bookmark: bookmark === null ? null : bookmark.toString(),
				logEndOffset: logEndOffset.toString(),
				recordsBehind:
					bookmark === null ? null : (logEndOffset - bookmark).toString(),
			},
		},
		`Partition ${topic}[${partition}] prepared in ${totalMs}ms`,
	);
}

function isProgressAheadOfLiveLog({ cause }: { cause: unknown }): boolean {
	return (
		cause instanceof PartitionBootstrapRefusedError &&
		cause.reason === "local_state_ahead_of_log_end"
	);
}

function assertStartupContinues({
	state,
}: {
	state: PartitionRuntimeState;
}): void {
	if (state.terminalError) throw state.terminalError;
	if (
		state.status !== "activating" &&
		state.status !== "fencing" &&
		state.status !== "bootstrapping" &&
		state.status !== "catching_up"
	) {
		throw new OwnedPartitionNotReadyError({ status: state.status });
	}
}
