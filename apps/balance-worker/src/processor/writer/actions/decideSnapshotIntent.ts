import {
	type MutationRecord,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type {
	SnapshotIntent,
	SnapshotIntentEntry,
} from "../../../state/types/snapshotIntent.js";
import type {
	PartitionWriterScope,
	PendingMutation,
} from "../types/partitionWriter.js";

/**
 * Per customer the batch touches: the rows every subject of it leaves, with the full read they descend from,
 * unless something makes them unprovable, in which case the customer's rows are deleted instead.
 */
export function decideSnapshotIntent({
	scope,
	batch,
}: {
	scope: PartitionWriterScope;
	batch: readonly PendingMutation[];
}): SnapshotIntent {
	const intent: SnapshotIntent = new Map();
	if (scope.ctx.subjectSnapshots?.get().mode !== "write") return intent;
	for (const pending of batch) {
		if (!pending.nextState) continue;
		const customerKey = meteringIdentityToPartitionKey({
			identity: pending.mutation.identity,
		});
		const sofar = intent.get(customerKey);
		if (sofar === "delete") continue;
		intent.set(customerKey, extend({ scope, sofar, pending }));
	}
	return intent;
}

/** The entry with this mutation's projected rows folded in; "delete" the moment one of them cannot be vouched for. */
function extend({
	scope,
	sofar,
	pending,
}: {
	scope: PartitionWriterScope;
	sofar: Exclude<SnapshotIntentEntry, "delete"> | undefined;
	pending: PendingMutation;
}): SnapshotIntentEntry {
	const { state } = scope;
	const { mutation } = pending;
	// Rows inserted by this very statement are not rows the statement's snapshot can see.
	if (insertsSubjectRows({ mutation })) return "delete";
	const bySubject = new Map<string, SubjectState>();
	let baselineAt = sofar?.baselineAt ?? Number.POSITIVE_INFINITY;
	for (const projected of sofar?.states ?? [])
		bySubject.set(
			meteringIdentityToSubjectKey({ identity: projected.identity }),
			projected,
		);
	// Still pinned by this very batch, so the map holds each subject as the batch leaves it.
	for (const subjectKey of pending.projectedSubjectKeys) {
		const projected = state.subjects.readState({ subjectKey });
		const readAt = state.subjects.readBaselineAt({ subjectKey });
		if (!projected || readAt === null) return "delete";
		baselineAt = Math.min(baselineAt, readAt);
		bySubject.set(subjectKey, projected);
	}
	return { states: [...bySubject.values()], baselineAt };
}

const insertsSubjectRows = ({ mutation }: { mutation: MutationRecord }) =>
	mutation.changes.some(
		(change) =>
			(change.table === "customer" || change.table === "entity") &&
			change.op === "insert",
	);
