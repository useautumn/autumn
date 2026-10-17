import { PartitionClaimRefusedError } from "../../state/stateStoreErrors.js";
import { PartitionBootstrapRefusedError } from "../bootstrap/partitionBootstrapErrors.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionProducerFencedError,
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
		const startedAt = performance.now();
		state.producerConnectionAttempted = true;
		await ctx.producer.connect();
		assertStartupContinues({ state });
		const connectedAt = performance.now();
		await ctx.producer.fence();
		assertStartupContinues({ state });
		const fencedAt = performance.now();
		await claimOwnedPartition({ ctx });
		assertStartupContinues({ state });
		const claimedAt = performance.now();

		// Activation keeps one status: a command that meets it waits instead of reading each step.
		if (!prepared) state.status = "bootstrapping";
		const logRange = await ctx.follower.readLogRange({
			topic,
			partition,
			signal,
		});
		assertStartupContinues({ state });
		const rangedAt = performance.now();
		// Bootstrap again after preparation: the bookmark moved while the predecessor drained.
		await ctx.bootstrapper.bootstrap({ topic, partition, logRange, signal });
		assertStartupContinues({ state });
		const bootstrappedAt = performance.now();
		const bookmark = ctx.stateStore.readNextOffset({ topic, partition });

		if (!prepared) state.status = "catching_up";
		state.followerStartAttempted = true;
		await ctx.follower.startAndCatchUp({
			topic,
			partition,
			targetNextOffset: logRange.logEndOffset,
			onUnavailable,
			preparedNextOffset: state.preparedNextOffset ?? undefined,
		});
		assertStartupContinues({ state });
		state.status = "ready";
		logActivation({
			ctx,
			prepared,
			marks: {
				startedAt,
				connectedAt,
				fencedAt,
				claimedAt,
				rangedAt,
				bootstrappedAt,
			},
			bookmark,
			preparedNextOffset: state.preparedNextOffset,
			logEndOffset: logRange.logEndOffset,
		});
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

async function claimOwnedPartition({
	ctx,
}: Pick<PartitionRuntimeScope, "ctx">): Promise<void> {
	const { topic, partition } = ctx.config;
	try {
		await ctx.stateStore.claimPartition?.({
			topic,
			partition,
			ownerEpoch: ctx.ownerEpoch?.(),
		});
	} catch (cause) {
		if (!(cause instanceof PartitionClaimRefusedError)) throw cause;
		throw new OwnedPartitionProducerFencedError({ topic, partition, cause });
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
		state.preparedNextOffset = logRange.logEndOffset;
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

function logActivation({
	ctx,
	prepared,
	marks,
	bookmark,
	preparedNextOffset,
	logEndOffset,
}: {
	ctx: PartitionRuntimeScope["ctx"];
	prepared: boolean;
	marks: {
		startedAt: number;
		connectedAt: number;
		fencedAt: number;
		claimedAt: number;
		rangedAt: number;
		bootstrappedAt: number;
	};
	bookmark: bigint | null;
	preparedNextOffset: bigint | null;
	logEndOffset: bigint;
}): void {
	const { topic, partition } = ctx.config;
	const totalMs = Math.round(performance.now() - marks.startedAt);
	ctx.logger?.info?.(
		{
			event: "balance_worker.partition_activated",
			data: {
				topic,
				partition,
				prepared,
				totalMs,
				connectMs: Math.round(marks.connectedAt - marks.startedAt),
				fenceMs: Math.round(marks.fencedAt - marks.connectedAt),
				claimMs: Math.round(marks.claimedAt - marks.fencedAt),
				logRangeMs: Math.round(marks.rangedAt - marks.claimedAt),
				bootstrapMs: Math.round(marks.bootstrappedAt - marks.rangedAt),
				catchUpMs: Math.round(performance.now() - marks.bootstrappedAt),
				bookmark: bookmark === null ? null : bookmark.toString(),
				preparedNextOffset:
					preparedNextOffset === null ? null : preparedNextOffset.toString(),
				logEndOffset: logEndOffset.toString(),
			},
		},
		`Partition ${topic}[${partition}] activated in ${totalMs}ms`,
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
