import type { OwnedPartitionRecoveryRequiredError } from "../runtimeErrors.js";

import type {
	PartitionRuntimeContext,
	RuntimeUnavailableListener,
} from "./partitionRuntime.js";

export type PartitionRuntimeStatus =
	| "created"
	| "starting"
	| "ready"
	| "draining"
	| "stopped"
	| "recovery_required";

export type PartitionRuntimeScope = {
	ctx: PartitionRuntimeContext;
	state: PartitionRuntimeState;
};

export type PartitionRuntimeState = {
	drainPromise: Promise<void> | null;
	status: PartitionRuntimeStatus;
	terminalError: OwnedPartitionRecoveryRequiredError | null;
	producerConnectionAttempted: boolean;
	followerStartAttempted: boolean;
	startPromise: Promise<void> | null;
	stopPromise: Promise<void> | null;
	stopFollowerPromise: Promise<void> | null;
	disconnectProducerPromise: Promise<void> | null;
	recoveryPromise: Promise<OwnedPartitionRecoveryRequiredError> | null;
	unavailableListeners: Set<RuntimeUnavailableListener>;
};
