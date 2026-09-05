import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type { PartitionOutcomeFollowerPort } from "../types/partitionRuntime.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";
import {
	completeRuntimePreparation,
	completeRuntimeStartup,
} from "./startupSteps.js";

export function startRuntime({
	ctx,
	state,
	prepared = false,
}: PartitionRuntimeScope & { prepared?: boolean }): Promise<void> {
	if (state.status !== (prepared ? "prepared" : "created")) {
		return Promise.reject(
			new OwnedPartitionNotReadyError({ status: state.status }),
		);
	}
	state.status = "fencing";
	state.startPromise = completeRuntimeStartup({ ctx, state });
	return state.startPromise;
}

export function prepareRuntime({
	ctx,
	state,
	follower,
}: PartitionRuntimeScope & {
	follower: PartitionOutcomeFollowerPort;
}): Promise<void> {
	if (state.status !== "created")
		return Promise.reject(
			new OwnedPartitionNotReadyError({ status: state.status }),
		);
	if (follower === ctx.follower)
		return Promise.reject(
			new Error("Preparation requires a separate read-only follower"),
		);
	state.status = "preparing";
	state.preparationFollower = follower;
	state.startPromise = completeRuntimePreparation({ ctx, state, follower });
	return state.startPromise;
}

export function activateRuntime({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (state.status !== "prepared")
		return Promise.reject(
			new OwnedPartitionNotReadyError({ status: state.status }),
		);
	return startRuntime({ ctx, state, prepared: true });
}
