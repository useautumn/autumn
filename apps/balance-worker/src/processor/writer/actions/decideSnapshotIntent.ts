import {
	type MutationRecord,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_REWRITE_MS } from "@autumn/env/balanceWorkerConstants";
import { writesSubjectSnapshots } from "../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type {
	SnapshotIntent,
	SnapshotIntentEntry,
} from "../../../state/types/snapshotIntent.js";
import { writerNowOf } from "../pendingMutations.js";
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
	const settings = scope.ctx.subjectSnapshotsConfig?.get();
	if (!settings || !writesSubjectSnapshots(settings)) return intent;
	const now = writerNowOf({ scope });
	for (const pending of batch) {
		if (!pending.nextState) continue;
		const customerKey = meteringIdentityToPartitionKey({
			identity: pending.mutation.identity,
		});
		const sofar = intent.get(customerKey);
		if (sofar === "delete") continue;
		intent.set(
			customerKey,
			extend({ scope, sofar, pending, maxBytes: settings.maxBytes, now }),
		);
	}
	return intent;
}

/** The entry with this mutation's projected rows folded in; "delete" the moment one of them cannot be vouched for. */
function extend({
	scope,
	sofar,
	pending,
	maxBytes,
	now,
}: {
	scope: PartitionWriterScope;
	sofar: Exclude<SnapshotIntentEntry, "delete"> | undefined;
	pending: PendingMutation;
	maxBytes: number;
	now: number;
}): SnapshotIntentEntry {
	const { state } = scope;
	const { mutation } = pending;
	// Rows inserted by this very statement are not rows the statement's snapshot can see.
	if (insertsSubjectRows({ mutation })) return "delete";
	// Unpinned at the append (written while off): the map may since hold a re-read that lacks this record.
	if (pending.pinsReleased) return "delete";
	const written = bySubjectKey({ states: sofar?.states });
	const stale = bySubjectKey({ states: sofar?.stale });
	let baselineAt = sofar?.baselineAt ?? Number.POSITIVE_INFINITY;
	// Still pinned by this very batch, so the map holds each subject as the batch leaves it.
	for (const subjectKey of pending.projectedSubjectKeys) {
		const projected = state.subjects.readState({ subjectKey });
		const readAt = state.subjects.readBaselineAt({ subjectKey });
		if (!projected || readAt === null) return "delete";
		// Decided from the map's weight, so a state over the cap is never serialised for a row it will not get.
		if (state.subjects.readBytes({ subjectKey }) > maxBytes) return "delete";
		baselineAt = Math.min(baselineAt, readAt);
		// A subject keeps the side this intent first put it on, so it is one row of the statement.
		if (written.has(subjectKey)) written.set(subjectKey, projected);
		else if (
			stale.has(subjectKey) ||
			writtenRecently({ scope, subjectKey, now })
		)
			stale.set(subjectKey, projected);
		else {
			state.subjects.noteSnapshotWritten({ subjectKey, at: now });
			written.set(subjectKey, projected);
		}
	}
	return {
		states: [...written.values()],
		...(stale.size > 0 && { stale: [...stale.values()] }),
		baselineAt,
	};
}

const bySubjectKey = ({ states }: { states?: readonly SubjectState[] }) =>
	new Map(
		(states ?? []).map((projected) => [
			meteringIdentityToSubjectKey({ identity: projected.identity }),
			projected,
		]),
	);

/** Written whole by an earlier flush within the rewrite interval. */
const writtenRecently = ({
	scope,
	subjectKey,
	now,
}: {
	scope: PartitionWriterScope;
	subjectKey: string;
	now: number;
}): boolean => {
	const writtenAt = scope.state.subjects.readSnapshotWrittenAt({ subjectKey });
	return (
		writtenAt !== null &&
		now - writtenAt < BALANCE_WORKER_SUBJECT_SNAPSHOT_REWRITE_MS
	);
};

const insertsSubjectRows = ({ mutation }: { mutation: MutationRecord }) =>
	mutation.changes.some(
		(change) =>
			(change.table === "customer" || change.table === "entity") &&
			change.op === "insert",
	);
