import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";
import { completeRuntimeStartup } from "./startupSteps.js";

export function startRuntime({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (state.status !== "created") {
		return Promise.reject(
			new OwnedPartitionNotReadyError({ status: state.status }),
		);
	}
	state.status = "starting";
	state.startPromise = completeRuntimeStartup({ ctx, state });
	return state.startPromise;
}
