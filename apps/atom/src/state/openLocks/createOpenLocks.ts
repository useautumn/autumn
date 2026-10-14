import type { TrackCommand, WorkerLock } from "@autumn/balance-engine";
import type { JournalEntry } from "../journal/types/journal.js";

/** A lock this slot took: the track that took it, compared with a retry, and the row it inserted, which its finalize carries. */
type OpenLock = { track: TrackCommand; row: WorkerLock };

/** The lock an owed entry takes or settles; null for a plain track. */
const lockIdOf = ({ command }: JournalEntry): string | null =>
	command.type === "finalize"
		? command.lock.lock_id
		: (command.lock?.lockId ?? null);

/**
 * The locks this slot took, by customer and lock_id. Memory only: after a restart a lock still owed is read back from
 * the journal.
 */
export const createOpenLocks = () => {
	const locksByCustomer = new Map<string, Map<string, OpenLock>>();

	function hold(lock: OpenLock): void {
		const { customerId } = lock.track.identity;
		const locks = locksByCustomer.get(customerId) ?? new Map();
		locks.set(lock.row.lock_id, lock);
		locksByCustomer.set(customerId, locks);
	}

	function lockOf({
		customerId,
		lockId,
	}: {
		customerId: string;
		lockId: string;
	}): OpenLock | null {
		return locksByCustomer.get(customerId)?.get(lockId) ?? null;
	}

	function trackOf({
		customerId,
		lockId,
		owed,
	}: {
		customerId: string;
		lockId: string;
		owed: readonly JournalEntry[];
	}): TrackCommand | null {
		const held = lockOf({ customerId, lockId })?.track;
		if (held) return held;
		for (const { command } of owed)
			if (command.type === "track" && command.lock?.lockId === lockId)
				return command;
		return null;
	}

	/** After a push: a lock leaves once nothing owed takes or settles it and Autumn no longer shows it open. */
	function settle({
		customerId,
		owed,
		openLockIds,
	}: {
		customerId: string;
		owed: readonly JournalEntry[];
		openLockIds: ReadonlySet<string>;
	}): void {
		const locks = locksByCustomer.get(customerId);
		if (!locks) return;
		const owedLockIds = new Set(owed.map(lockIdOf));
		for (const lockId of locks.keys())
			if (!owedLockIds.has(lockId) && !openLockIds.has(lockId))
				locks.delete(lockId);
		if (locks.size === 0) locksByCustomer.delete(customerId);
	}

	return { hold, lockOf, trackOf, settle };
};

export type OpenLocks = ReturnType<typeof createOpenLocks>;
