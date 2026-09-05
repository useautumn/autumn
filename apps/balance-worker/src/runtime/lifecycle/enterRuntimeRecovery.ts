import { ownedPartitionFailureReasonOf } from "../../health/ownedPartitionHealth.js";
import {
	createOwnedPartitionRecoveryError,
	type OwnedPartitionRecoveryRequiredError,
} from "../runtimeErrors.js";
import type { PartitionRuntimeContext } from "../types/partitionRuntime.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";
import { disposeRuntimeResources } from "./disposeRuntimeResources.js";

export function enterRuntimeRecovery({
	ctx,
	state,
	cause,
	drainAcceptedWork = false,
}: PartitionRuntimeScope & {
	cause: unknown;
	drainAcceptedWork?: boolean;
}): Promise<OwnedPartitionRecoveryRequiredError> {
	if (state.recoveryPromise) return state.recoveryPromise;
	const { topic, partition } = ctx.config;
	const recoveryError = createOwnedPartitionRecoveryError({
		topic,
		partition,
		cause,
	});
	state.terminalError = recoveryError;
	state.failureReason = ownedPartitionFailureReasonOf({ cause });
	state.startupAbortController.abort(recoveryError);
	state.status = "recovery_required";
	state.recoveryPromise = finishRuntimeRecovery({
		ctx,
		state,
		cause,
		recoveryError,
		drainAcceptedWork,
	});
	for (const listener of state.unavailableListeners)
		listener({ cause: recoveryError });
	return state.recoveryPromise;
}

async function finishRuntimeRecovery({
	ctx,
	state,
	cause,
	recoveryError,
	drainAcceptedWork,
}: PartitionRuntimeScope & {
	cause: unknown;
	recoveryError: OwnedPartitionRecoveryRequiredError;
	drainAcceptedWork: boolean;
}): Promise<OwnedPartitionRecoveryRequiredError> {
	// Record recovery and notify synchronous listeners before cleanup can re-enter the runtime.
	await Promise.resolve();
	try {
		if (drainAcceptedWork) await drainWithinRecoveryTimeout({ ctx });
		await disposeRuntimeResources({ ctx, state });
		return recoveryError;
	} catch (cleanupCause) {
		const { topic, partition } = ctx.config;
		const combinedCause = new AggregateError(
			[cause, cleanupCause],
			"Owned partition recovery cleanup failed",
		);
		const combinedError = createOwnedPartitionRecoveryError({
			topic,
			partition,
			cause: combinedCause,
		});
		state.terminalError = combinedError;
		return combinedError;
	}
}

async function drainWithinRecoveryTimeout({
	ctx,
}: {
	ctx: PartitionRuntimeContext;
}): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	function scheduleTimeout(resolve: () => void): void {
		timeout = setTimeout(resolve, ctx.config.recoveryDrainTimeoutMs);
	}
	try {
		await Promise.race([
			ctx.requestTracker.drain(),
			new Promise<void>(scheduleTimeout),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
