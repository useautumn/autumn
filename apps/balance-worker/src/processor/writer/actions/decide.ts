import {
	type MeteringIdentity,
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
	MutationDurability,
	MutationSubmission,
} from "../types/mutation.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";
import {
	PartitionWriterCommandConflictError,
	PartitionWriterDuplicateCommandError,
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
		assertSameRequest({
			commandId,
			fingerprint,
			record: inFlight.mutation.receipt,
		});
		return decidedWith<Reply>({
			kind: "duplicate",
			committed: inFlight.settlement.join({ kind: "duplicate" }),
			stored: inFlight.settlement.waitForStore(),
		});
	}

	// A null state is legal here: initialize is the command that creates one.
	const currentState = readFreshestState({ scope, identity });
	const receipt = ctx.stateStore.readReceipt({
		identity,
		mutationId: commandId,
	});
	if (receipt) {
		assertSameRequest({ commandId, fingerprint, record: receipt.receipt });
		if (!currentState)
			throw new PartitionWriterStateNotFoundError({ customerKey });
		return decidedWith<Reply>({
			kind: "duplicate",
			stored: Promise.resolve(),
			committed: Promise.resolve({
				kind: "duplicate",
				mutation: receipt,
				state: currentState,
			}),
		});
	}
	// A store without records (postgres) still remembers the id: same request → duplicate, else conflict.
	const remembered = ctx.recentCommands.read({ identity, commandId });
	if (remembered) {
		assertSameRequest({ commandId, fingerprint, record: remembered });
		throw new PartitionWriterDuplicateCommandError({ commandId });
	}

	const result = submission.mutate({ state: currentState });
	if (result.kind === "reply")
		return decidedWith<Reply>({
			kind: "reply",
			committed: Promise.resolve(result.reply),
			stored: state.storeCompletion,
		});

	const pending = enqueueMutation({
		scope,
		pendingKey,
		customerKey,
		mutation: mutationToRecord({
			mutation: result.mutation,
			fingerprint,
			receiptPolicy: ctx.receiptPolicy,
			source: submission.source,
		}),
		nextState: result.nextState,
		projectedStates: result.projectedStates,
		durability: durabilityFor({
			scope,
			customerKey,
			requested: submission.durability ?? "log",
		}),
		catalog: result.catalog,
	});
	scheduleCommit({ scope });
	return decidedWith<Reply>({
		kind: "write",
		committed: pending.committed,
		stored: pending.settlement.waitForStore(),
	});
}

/** A write decided on one the store has not taken yet waits for the store too: if that one is refused, this one sits on rows that never landed. */
function durabilityFor({
	scope,
	customerKey,
	requested,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
	requested: MutationDurability;
}): MutationDurability {
	if (requested === "store") return "store";
	const pending = scope.state.pendingByCustomerKey.get(customerKey) ?? [];
	const followsUnlandedStoreWrite = [...pending].some(
		(earlier) => earlier.durability === "store",
	);
	return followsUnlandedStoreWrite ? "store" : "log";
}

function decidedWith<Reply>({
	kind,
	committed,
	stored,
}: {
	kind: DecidedMutation<Reply>["kind"];
	committed: Promise<Reply | CommittedMutation>;
	stored: Promise<void>;
}): DecidedMutation<Reply> {
	function waitForCommit(): Promise<Reply | CommittedMutation> {
		return committed;
	}
	function waitForStore(): Promise<void> {
		return stored;
	}
	return { kind, waitForCommit, waitForStore };
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

/** Per subject, the map first (projected or committed), then the store: same-customer commands see uncommitted deductions, whichever subject made them. */
export function readFreshestState({
	scope,
	identity,
}: {
	scope: PartitionWriterScope;
	identity: MeteringIdentity;
}): SubjectState | null {
	// One subject's own rows: the map first, then the store. Only sqlite answers from the
	// store (its resident row); the postgres store returns null, so a miss means hydrate.
	const readOwnState = ({ ownIdentity }: { ownIdentity: MeteringIdentity }) =>
		scope.state.subjects.readState({
			subjectKey: meteringIdentityToSubjectKey({ identity: ownIdentity }),
		}) ?? scope.ctx.stateStore.readOwnState({ identity: ownIdentity });

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
	record: { fingerprint: string };
}): void {
	if (record.fingerprint === fingerprint) return;
	throw new PartitionWriterCommandConflictError({ commandId });
}
