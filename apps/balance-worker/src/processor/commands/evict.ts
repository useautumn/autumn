import { type EvictCommand, parseEvictCommand } from "@autumn/balance-engine";
import type { EvictReply } from "@autumn/balance-worker-client/protocol";
import { BALANCE_WORKER_EVICTS_LOGGED } from "@autumn/env/balanceWorkerConstants";
import { awaitSnapshotDeleteLanded } from "../actions/awaitSnapshotDeleteLanded.js";
import { dropStaleSubject } from "../actions/dropStaleSubject.js";
import { listSnapshotSubjects } from "../actions/listSnapshotSubjects.js";
import { logEvict } from "../actions/logEvict.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** Another writer changed the customer's rows: forget them, the next command hydrates afresh. */
export async function evict({
	scope,
	command,
	waitsForSnapshotDelete,
}: {
	scope: PartitionProcessorScope;
	command: EvictCommand;
	waitsForSnapshotDelete: boolean;
}): Promise<EvictReply> {
	// The flag is the owner's instruction, not part of the record the log keeps.
	const { refreshSnapshots = false, ...evicting } = parseEvictCommand({
		input: command,
	});
	const { identity } = evicting;
	const customerIdentity = { ...identity, entityId: null };
	const droppedState = scope.ctx.writer.readFreshestState({
		identity: customerIdentity,
	});
	const snapshotSubjects = refreshSnapshots
		? await listSnapshotSubjects({ scope, identity })
		: [];
	// A load still in flight started before this evict, so it must not put its rows back afterwards.
	await dropStaleSubject({ scope, identity });
	if (waitsForSnapshotDelete)
		await awaitSnapshotDeleteLanded({ scope, identity });
	// Read after the drop; the lane lands deletes before refreshes, so the rows rebuilt never precede the DELETE.
	if (snapshotSubjects.length > 0)
		scope.ctx.subjectHydrator.refreshSnapshots({
			customer: customerIdentity,
			subjects: snapshotSubjects,
		});
	if (logsEvicts({ scope }))
		await logEvict({ scope, command: evicting, droppedState });
	return { evicted: droppedState !== null };
}

/** Postgres-backed only: the sqlite store would replay the record into rows it cannot drop. */
const logsEvicts = ({ scope }: { scope: PartitionProcessorScope }): boolean =>
	(scope.ctx.config.logsEvicts ?? BALANCE_WORKER_EVICTS_LOGGED) &&
	scope.ctx.stateStore.baseline === "map";
