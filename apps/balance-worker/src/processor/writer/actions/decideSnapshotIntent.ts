import {
	type MutationRecord,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { writesSubjectSnapshots } from "@autumn/edge-config";
import type {
	SnapshotIntent,
	SnapshotIntentEntry,
} from "../../../state/types/snapshotIntent.js";
import type {
	PartitionWriterScope,
	PendingMutation,
} from "../types/partitionWriter.js";

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
	for (const pending of batch) {
		if (!pending.nextState) continue;
		const customerKey = meteringIdentityToPartitionKey({
			identity: pending.mutation.identity,
		});
		const sofar = intent.get(customerKey);
		if (sofar === "delete") continue;
		intent.set(
			customerKey,
			extend({ scope, sofar, pending, maxBytes: settings.maxBytes }),
		);
	}
	return intent;
}

function extend({
	scope,
	sofar,
	pending,
	maxBytes,
}: {
	scope: PartitionWriterScope;
	sofar: Exclude<SnapshotIntentEntry, "delete"> | undefined;
	pending: PendingMutation;
	maxBytes: number;
}): SnapshotIntentEntry {
	const { state } = scope;
	const { mutation } = pending;
	if (insertsSubjectRows({ mutation })) return "delete";
	const bySubject = new Map<string, SubjectState>();
	let baselineAt = sofar?.baselineAt ?? Number.POSITIVE_INFINITY;
	for (const projected of sofar?.states ?? [])
		bySubject.set(
			meteringIdentityToSubjectKey({ identity: projected.identity }),
			projected,
		);
	for (const subjectKey of pending.projectedSubjectKeys) {
		const projected = state.subjects.readState({ subjectKey });
		const readAt = state.subjects.readBaselineAt({ subjectKey });
		if (!projected || readAt === null) return "delete";
		if (state.subjects.readBytes({ subjectKey }) > maxBytes) return "delete";
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
