import {
	type CustomerState,
	type CustomerStateMutation,
	type MeteringIdentity,
	meteringPartitionKeyOf,
} from "@autumn/balance-engine";
import {
	enqueueMutation,
	pendingCommitsFor,
	pendingKeyOf,
} from "../pendingMutations.js";
import type {
	CommittedMutation,
	DecidedMutation,
	MutationSubmission,
} from "../types/mutation.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";
import { PartitionWriterCommandConflictError } from "../writerErrors.js";
import { scheduleCommit } from "./commit.js";

/**
 * Synchronous until the mutation is enqueued: no await may separate reading the
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
		assertSameRequest({ commandId, fingerprint, mutation: inFlight.mutation });
		return decidedWith<Reply>(inFlight.settlement.join({ kind: "duplicate" }));
	}

	const receipt = ctx.stateStore.readReceipt({
		identity,
		mutationId: commandId,
	});
	if (receipt) {
		assertSameRequest({ commandId, fingerprint, mutation: receipt });
		return decidedWith<Reply>(
			Promise.resolve({ kind: "duplicate", mutation: receipt }),
		);
	}

	// A null state is legal here: initialize is the command that creates one.
	const currentState = readFreshestState({ scope, customerKey, identity });
	const result = submission.mutate({ state: currentState });
	if (result.kind === "reply")
		return decidedWith<Reply>(Promise.resolve(result.reply));

	const committed = enqueueMutation({
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

/** Pending projection first, so same-customer commands see uncommitted deductions. */
export function readFreshestState({
	scope,
	customerKey,
	identity,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
	identity: MeteringIdentity;
}): CustomerState | null {
	return (
		scope.state.projectedStateByCustomerKey.get(customerKey) ??
		scope.ctx.stateStore.readState({ identity })
	);
}

/** A known mutation for this commandId must have been produced by the same request. */
function assertSameRequest({
	commandId,
	fingerprint,
	mutation,
}: {
	commandId: string;
	fingerprint: string;
	mutation: CustomerStateMutation;
}): void {
	if (mutation.receipt.fingerprint === fingerprint) return;
	throw new PartitionWriterCommandConflictError({ commandId });
}
