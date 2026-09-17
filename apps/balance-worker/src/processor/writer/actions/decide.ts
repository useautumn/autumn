import {
	type MeteringIdentity,
	type MutationRecord,
	mergeSubjectStates,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import {
	enqueueMutation,
	pendingCommitsFor,
	pendingKeyOf,
} from "../pendingMutations.js";
import { commandToFingerprint } from "../receipt/commandToFingerprint.js";
import { mutationToRecord } from "../receipt/mutationToRecord.js";
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
 * Synchronous until the record is enqueued: no await may separate reading the
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
	const { command, baseline } = submission;
	const { identity, commandId } = command;
	const fingerprint = commandToFingerprint({ command, baseline });
	const customerKey = meteringIdentityToPartitionKey({ identity });
	const pendingKey = pendingKeyOf({ customerKey, commandId });

	const inFlight = state.pendingByKey.get(pendingKey);
	if (inFlight) {
		assertSameRequest({ commandId, fingerprint, record: inFlight.mutation });
		return decidedWith<Reply>(inFlight.settlement.join({ kind: "duplicate" }));
	}

	const receipt = ctx.stateStore.readReceipt({
		identity,
		mutationId: commandId,
	});
	// A null state is legal here: initialize is the command that creates one.
	const currentState = readFreshestState({ scope, identity });
	if (receipt) {
		assertSameRequest({ commandId, fingerprint, record: receipt });
		if (!currentState)
			throw new PartitionWriterStateNotFoundError({ customerKey });
		return decidedWith<Reply>(
			Promise.resolve({
				kind: "duplicate",
				mutation: receipt,
				state: currentState,
			}),
		);
	}

	const result = submission.mutate({ state: currentState });
	if (result.kind === "reply")
		return decidedWith<Reply>(Promise.resolve(result.reply));

	const committed = enqueueMutation({
		scope,
		pendingKey,
		customerKey,
		mutation: mutationToRecord({
			mutation: result.mutation,
			fingerprint,
			receiptPolicy: ctx.receiptPolicy,
		}),
		nextState: result.nextState,
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

/** Snapshot at call time: mutations enqueued after this returns do not extend the wait. */
export async function waitForPendingCommits({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): Promise<void> {
	const commits = pendingCommitsFor({ state: scope.state, customerKey });
	if (commits.length > 0) await Promise.allSettled(commits);
	if (scope.state.recoveryError) throw scope.state.recoveryError;
}

/** Per subject, pending projection first: same-customer commands see uncommitted deductions, whichever subject made them. */
export function readFreshestState({
	scope,
	identity,
}: {
	scope: PartitionWriterScope;
	identity: MeteringIdentity;
}): SubjectState | null {
	const readOwnState = ({ ownIdentity }: { ownIdentity: MeteringIdentity }) =>
		scope.state.projectedStateBySubjectKey.get(
			meteringIdentityToSubjectKey({ identity: ownIdentity }),
		) ?? scope.ctx.stateStore.readOwnState({ identity: ownIdentity });

	const customer = readOwnState({
		ownIdentity: { ...identity, entityId: null },
	});
	if (!customer) return null;
	const entity = identity.entityId
		? readOwnState({ ownIdentity: identity })
		: null;
	return mergeSubjectStates({ customer, entity });
}

/** A known record for this commandId must have been produced by the same request. */
function assertSameRequest({
	commandId,
	fingerprint,
	record,
}: {
	commandId: string;
	fingerprint: string;
	record: MutationRecord;
}): void {
	if (record.receipt.fingerprint === fingerprint) return;
	throw new PartitionWriterCommandConflictError({ commandId });
}
