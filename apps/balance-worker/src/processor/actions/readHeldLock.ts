import {
	parseWorkerLock,
	type TrackCommand,
	type TrackLock,
	type WorkerLock,
} from "@autumn/balance-engine";
import { resolveLockRow } from "../../consume/resolveLockRow.js";
import type { PartitionProcessorScope } from "../types/partitionProcessor.js";

/** Whether the customer may hold this lock id open: it does in memory, or its rows are not resident to say. */
const mayHoldLockId = ({
	scope,
	command: { identity },
	lockId,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
	lockId: string;
}): boolean => {
	// Open locks live on the customer's part of the state, whichever subject the command names.
	const state = scope.ctx.writer.readFreshestState({
		identity: { ...identity, entityId: null },
	});
	return !state || state.openLocks.some((open) => open.lock_id === lockId);
};

/** Autumn's row for a sync locked track's lock id, read only when the lock may already be open: a retry is told from a conflict by it. */
export async function readHeldLock({
	scope,
	command,
	lock,
}: {
	scope: PartitionProcessorScope;
	command: TrackCommand;
	lock: TrackLock;
}): Promise<WorkerLock | null> {
	const named = { identity: command.identity, lockId: lock.lockId };
	const pending = scope.ctx.writer.pendingLockRow(named);
	if (pending || !mayHoldLockId({ scope, command, lockId: named.lockId }))
		return pending;
	const { identity, lockId } = named;
	const rows = await scope.ctx.db.readLockRows({
		keys: [{ orgId: identity.orgId, env: identity.env, lockId }],
	});
	return resolveLockRow({
		pending: null,
		rows: rows.map((row) => parseWorkerLock({ input: row })),
		command: named,
	});
}
