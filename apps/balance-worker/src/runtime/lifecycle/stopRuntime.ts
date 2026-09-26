import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type { PartitionRuntimeContext } from "../types/partitionRuntime.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";
import {
	cancelRuntimeReaders,
	disposeRuntimeResources,
	settleRuntimeStartup,
	stopRuntimeFollower,
} from "./disposeRuntimeResources.js";

export function stopRuntime({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (state.stopPromise) return state.stopPromise;
	if (state.status === "recovery_required")
		return awaitRecoveryDisposal({ ctx, state });
	if (state.status === "stopped") return Promise.resolve();
	if (state.status === "created") {
		state.status = "stopped";
		return Promise.resolve();
	}
	state.status = "draining";
	state.startupAbortController.abort(
		new OwnedPartitionNotReadyError({ status: "draining" }),
	);
	cancelRuntimeReaders({ ctx, state });
	state.stopPromise = finishRuntimeStop({ ctx, state });
	return state.stopPromise;
}

export function drainRuntime({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (state.drainPromise) return state.drainPromise;
	if (state.terminalError) return Promise.reject(state.terminalError);
	if (state.status === "stopped") return Promise.resolve();
	const startupPending = state.status !== "ready";
	state.status = "draining";
	state.startupAbortController.abort(
		new OwnedPartitionNotReadyError({ status: "draining" }),
	);
	if (startupPending) cancelRuntimeReaders({ ctx, state });
	state.drainPromise = finishRuntimeDrain({ ctx, state });
	return state.drainPromise;
}

export async function waitForRuntimeQuiescence({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	await settleRuntimeStartup({ state });
	await settleProcessor({ ctx });
	await state.preparationStopPromise;
	await state.stopFollowerPromise;
}

/** Settlement only: stop and quiescence finish whatever the store decided, while
 *  the verdict itself belongs to `drainRuntime`, whose caller names a successor on it. */
export async function settleProcessor({
	ctx,
}: {
	ctx: PartitionRuntimeContext;
}): Promise<void> {
	await Promise.allSettled([ctx.processor.drain()]);
}

async function finishRuntimeStop({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	await settleRuntimeStartup({ state });
	await settleProcessor({ ctx });
	await disposeRuntimeResources({ ctx, state });
	state.status = state.terminalError ? "recovery_required" : "stopped";
}

async function finishRuntimeDrain({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	await settleRuntimeStartup({ state });
	await ctx.processor.drain();
	await stopRuntimeFollower({ ctx, state });
	if (state.terminalError) throw state.terminalError;
}

async function awaitRecoveryDisposal({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (state.recoveryPromise) await state.recoveryPromise;
	else await disposeRuntimeResources({ ctx, state });
}
