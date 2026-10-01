import { clearRolloversOverMax, type Rollover } from "@autumn/shared";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";

/**
 * New rollovers for a held row, then the cap trims the oldest first; each outcome is its own change.
 * The reset adds what a cycle end left on the row; a billing plan adds rows the server computed.
 */
export const addRolloversWithinMax = ({
	row,
	newRollovers,
}: {
	row: WorkerFullCustomerEntitlementWithProduct;
	newRollovers: Rollover[];
}): RowChange[] => {
	const { inserts, updates, deleteIds } = clearRolloversOverMax({
		cusEnt: row,
		newRollovers,
	});
	const existingById = new Map(
		row.rollovers.map((rollover) => [rollover.id, rollover]),
	);
	const rolloverToUpdateChange = (rollover: Rollover): RowChange => ({
		table: "rollovers",
		op: "update",
		id: rollover.id,
		before: { balance: existingById.get(rollover.id)?.balance },
		after: { balance: rollover.balance, entities: rollover.entities },
	});
	return [
		...inserts.map(
			(rollover): RowChange => ({
				table: "rollovers",
				op: "insert",
				row: rollover,
			}),
		),
		...updates.map(rolloverToUpdateChange),
		...deleteIds.map(
			(id): RowChange => ({ table: "rollovers", op: "delete", id }),
		),
	];
};
