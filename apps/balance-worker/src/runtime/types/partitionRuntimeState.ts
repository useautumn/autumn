import type { OwnedPartitionRecoveryRequiredError } from "../runtimeErrors.js";

import type {
	PartitionOutcomeFollowerPort,
	PartitionRuntimeContext,
	RuntimeUnavailableListener,
} from "./partitionRuntime.js";

export type PartitionRuntimeStatus =
	| "created"
	| "preparing"
	| "prepared"
	| "fencing"
	| "bootstrapping"
	| "catching_up"
	| "ready"
	| "draining"
	| "stopped"
	| "recovery_required";

export type PartitionRuntimeScope = {
	ctx: PartitionRuntimeContext;
	state: PartitionRuntimeState;
};

export type PartitionRuntimeState = {
	preparationFollower: PartitionOutcomeFollowerPort | null;
	preparationStopPromise: Promise<void> | null;
	drainPromise: Promise<void> | null;
	status: PartitionRuntimeStatus;
	terminalError: OwnedPartitionRecoveryRequiredError | null;
	failureReason: string | null;
	producerConnectionAttempted: boolean;
	followerStartAttempted: boolean;
	startPromise: Promise<void> | null;
	stopPromise: Promise<void> | null;
	stopFollowerPromise: Promise<void> | null;
	disconnectProducerPromise: Promise<void> | null;
	recoveryPromise: Promise<OwnedPartitionRecoveryRequiredError> | null;
	startupAbortController: AbortController;
	unavailableListeners: Set<RuntimeUnavailableListener>;
};
