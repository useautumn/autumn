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
	if (startupPending) cancelRuntimeReaders({ ctx, state });
	state.drainPromise = finishRuntimeDrain({ ctx, state });
	return state.drainPromise;
}

export async function waitForRuntimeQuiescence({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	await settleRuntimeStartup({ state });
	await ctx.requestTracker.drain();
	await state.stopFollowerPromise;
}

async function finishRuntimeStop({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	await settleRuntimeStartup({ state });
	await ctx.requestTracker.drain();
	await disposeRuntimeResources({ ctx, state });
	state.status = state.terminalError ? "recovery_required" : "stopped";
}

async function finishRuntimeDrain({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	await settleRuntimeStartup({ state });
	await ctx.requestTracker.drain();
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
