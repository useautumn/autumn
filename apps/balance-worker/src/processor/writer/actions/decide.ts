import {
	type CustomerMeteringState,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	type StateInitializedEvent,
	stateInitializationFingerprintOf,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { ConflictingMeteringStateInitializationError } from "../../../state/sqliteBalanceStateErrors.js";
import {
	enqueueOutcome,
	pendingCommitsFor,
	pendingKeyOf,
} from "../pendingOutcomes.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationSubmission,
} from "../types/mutation.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";
import {
	PartitionWriterCommandConflictError,
	PartitionWriterStateNotFoundError,
} from "../writerErrors.js";
import { scheduleCommit } from "./commit.js";

/**
 * Synchronous until the outcome is enqueued: no await may separate reading the
 * projection from recording the next one, or concurrent commands would interleave.
 */
export function decide<Reply>({
	scope,
	submission,
}: {
	scope: PartitionWriterScope;
	submission: MutationSubmission<Reply>;
}): DecidedMutation<Reply> {
	const { ctx, state } = scope;
	if (state.recoveryError) throw state.recoveryError;
	const { identity, commandId, fingerprint } = submission;
	const customerKey = meteringPartitionKeyOf({ identity });
	const pendingKey = pendingKeyOf({ customerKey, commandId });

	const inFlight = state.pendingByKey.get(pendingKey);
	if (inFlight) {
		assertSameRequest({ commandId, fingerprint, outcome: inFlight.outcome });
		return decidedWith<Reply>(inFlight.settlement.join({ kind: "duplicate" }));
	}

	const currentState = readFreshestState({ scope, customerKey, identity });
	if (!currentState)
		throw new PartitionWriterStateNotFoundError({ customerKey });

	const receipt = ctx.stateStore.readTrackReceipt({ identity, commandId });
	if (receipt) {
		assertSameRequest({ commandId, fingerprint, outcome: receipt });
		return decidedWith<Reply>(
			Promise.resolve({ kind: "duplicate", outcome: receipt }),
		);
	}

	const result = submission.mutate({ state: currentState });
	if (result.kind === "reply")
		return decidedWith<Reply>(Promise.resolve(result.reply));

	const committed = enqueueOutcome({
		scope,
		pendingKey,
		customerKey,
		...result,
	});
	scheduleCommit({ scope });
	return decidedWith<Reply>(committed);
}

function decidedWith<Reply>(
	committed: Promise<Reply | CommittedMutation>,
): DecidedMutation<Reply> {
	function waitForCommit(): Promise<Reply | CommittedMutation> {
		return committed;
	}
	return { waitForCommit };
}

/** Snapshot at call time: outcomes enqueued after this returns do not extend the wait. */
export async function waitForPendingCommits({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): Promise<void> {
	const commits = pendingCommitsFor({ state: scope.state, customerKey });
	if (commits.length > 0) await Promise.allSettled(commits);
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
	scheduleCommit({ scope });
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
