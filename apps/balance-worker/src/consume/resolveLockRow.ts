import type { MeteringIdentity, WorkerLock } from "@autumn/balance-engine";

/** A row the batch read is the command's only when the command's own customer holds it. */
const isHeldBy = ({
	row,
	identity,
}: {
	row: WorkerLock;
	identity: MeteringIdentity;
}): boolean =>
	row.org_id === identity.orgId &&
	row.env === identity.env &&
	row.customer_id === identity.customerId;

/** The row behind a lock id: still pending when decided in this batch, else the batch's one read has it; null when neither. */
export const resolveLockRow = ({
	pending,
	rows,
	command: { identity, lockId },
}: {
	pending: WorkerLock | null;
	rows: readonly WorkerLock[];
	command: { identity: MeteringIdentity; lockId: string };
}): WorkerLock | null =>
	pending ??
	rows.find((row) => row.lock_id === lockId && isHeldBy({ row, identity })) ??
	null;
