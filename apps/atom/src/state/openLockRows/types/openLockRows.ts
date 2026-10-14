import type { WorkerLock } from "@autumn/balance-engine";
import type { JournalEntry } from "../../journal/types/journal.js";

/**
 * The rows of the locks this slot took, by customer: a retried lock_id is compared with its row, and only the slot that
 * took a lock computed it. Memory only; after a restart a lock still owed has its row replayed from the journal.
 */
export type OpenLockRows = {
	hold(params: { row: WorkerLock }): void;
	rowOf(params: { customerId: string; lockId: string }): WorkerLock | null;
	/**
	 * After a push: a row leaves once nothing owed names its lock and the push no longer shows it open, so Autumn holds
	 * its track and settled or expired it.
	 */
	settle(params: {
		customerId: string;
		owed: readonly JournalEntry[];
		openLockIds: ReadonlySet<string>;
	}): void;
};
