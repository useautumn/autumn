import type { WorkerLock } from "@autumn/balance-engine";
import type { JournalEntry } from "../journal/types/journal.js";
import type { OpenLockRows } from "./types/openLockRows.js";

/** The lock an owed entry takes; null for a plain track. */
const lockIdOf = ({ command }: JournalEntry): string | null =>
	command.lock?.lockId ?? null;

export const createOpenLockRows = (): OpenLockRows => {
	const rowsByCustomer = new Map<string, Map<string, WorkerLock>>();

	function hold({ row }: { row: WorkerLock }): void {
		const rows = rowsByCustomer.get(row.customer_id) ?? new Map();
		rows.set(row.lock_id, row);
		rowsByCustomer.set(row.customer_id, rows);
	}

	function rowOf({
		customerId,
		lockId,
	}: {
		customerId: string;
		lockId: string;
	}): WorkerLock | null {
		return rowsByCustomer.get(customerId)?.get(lockId) ?? null;
	}

	function settle({
		customerId,
		owed,
		openLockIds,
	}: {
		customerId: string;
		owed: readonly JournalEntry[];
		openLockIds: ReadonlySet<string>;
	}): void {
		const rows = rowsByCustomer.get(customerId);
		if (!rows) return;
		const owedLockIds = new Set(owed.map(lockIdOf));
		for (const lockId of rows.keys())
			if (!owedLockIds.has(lockId) && !openLockIds.has(lockId))
				rows.delete(lockId);
		if (rows.size === 0) rowsByCustomer.delete(customerId);
	}

	return { hold, rowOf, settle };
};
