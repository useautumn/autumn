import {
	type CustomerMeteringState,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	type StateInitializedEvent,
	stateInitializationFingerprintOf,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { ConflictingMeteringStateInitializationError } from "../../../state/sqliteBalanceStateErrors.js";
import { enqueueOutcome, pendingKeyOf } from "../pendingOutcomes.js";
import type {
	CommittedMutation,
	MutationSubmission,
} from "../types/mutation.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";
import {
	PartitionWriterCommandConflictError,
	PartitionWriterStateNotFoundError,
} from "../writerErrors.js";
import { scheduleDrain } from "./drainOutcomes.js";

/**
 * Synchronous until the outcome is enqueued: no await may separate reading the
 * projection from recording the next one, or concurrent commands would interleave.
 */
export function submitMutation<Reply>({
	scope,
	submission,
}: {
	scope: PartitionWriterScope;
	submission: MutationSubmission<Reply>;
}): Promise<Reply | CommittedMutation> {
	const { ctx, state } = scope;
	if (state.recoveryError) throw state.recoveryError;
	const { identity, commandId, fingerprint } = submission;
	const customerKey = meteringPartitionKeyOf({ identity });

	const inFlight = state.pendingByKey.get(
		pendingKeyOf({ customerKey, commandId }),
	);
	if (inFlight) {
		assertSameRequest({ commandId, fingerprint, outcome: inFlight.outcome });
		return inFlight.settlement.join({ kind: "duplicate" });
	}

	const currentState = readFreshestState({ scope, customerKey, identity });
	if (!currentState)
		throw new PartitionWriterStateNotFoundError({ customerKey });

	const receipt = ctx.stateStore.readTrackReceipt({ identity, commandId });
	if (receipt) {
		assertSameRequest({ commandId, fingerprint, outcome: receipt });
		return Promise.resolve({ kind: "duplicate", outcome: receipt });
	}

	const result = submission.mutate({ state: currentState });
	if (result.kind === "reply") return Promise.resolve(result.reply);

	const committed = enqueueOutcome({
		scope,
		pendingKey: pendingKeyOf({ customerKey, commandId }),
		customerKey,
		...result,
	});
	scheduleDrain({ scope });
	return committed;
}

export function submitInitialization({
	scope,
	initialization,
}: {
	scope: PartitionWriterScope;
	initialization: StateInitializedEvent;
}): Promise<CommittedMutation | { kind: "already_initialized" }> {
	const { state } = scope;
	if (state.recoveryError) throw state.recoveryError;
	const { identity } = initialization.state;
	const customerKey = meteringPartitionKeyOf({ identity });
	const pendingKey = pendingKeyOf({
		customerKey,
		commandId: initialization.initializationId,
	});
	const inFlight = state.pendingByKey.get(pendingKey);

	if (inFlight) {
		if (!isSameBaseline({ pending: inFlight.outcome, initialization })) {
			throw new ConflictingMeteringStateInitializationError({
				partitionKey: customerKey,
			});
		}
		return inFlight.settlement.join({ kind: "duplicate" });
	}
	if (readFreshestState({ scope, customerKey, identity })) {
		return Promise.resolve({ kind: "already_initialized" });
	}
	const committed = enqueueOutcome({
		scope,
		pendingKey,
		customerKey,
		outcome: initialization,
		nextState: initialization.state,
	});
	scheduleDrain({ scope });
	return committed;
}

/** Pending projection first, so same-customer commands see uncommitted deductions. */
function readFreshestState({
	scope,
	customerKey,
	identity,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
	identity: MeteringIdentity;
}): CustomerMeteringState | null {
	return (
		scope.state.projectedStateByCustomerKey.get(customerKey) ??
		scope.ctx.stateStore.readState({ identity })
	);
}

/** A known outcome for this commandId must have been produced by the same request. */
function assertSameRequest({
	commandId,
	fingerprint,
	outcome,
}: {
	commandId: string;
	fingerprint: string;
	outcome: MeteringRecord;
}): void {
	const sameRequest =
		outcome.type === "track_outcome" &&
		outcome.commandFingerprint === fingerprint;
	if (!sameRequest)
		throw new PartitionWriterCommandConflictError({ commandId });
}

/** Same initializationId must carry the same baseline, mirroring the store's committed check. */
function isSameBaseline({
	pending,
	initialization,
}: {
	pending: MeteringRecord;
	initialization: StateInitializedEvent;
}): boolean {
	return (
		pending.type === "state_initialized" &&
		stateInitializationFingerprintOf({ initialization: pending }) ===
			stateInitializationFingerprintOf({ initialization })
	);
}
