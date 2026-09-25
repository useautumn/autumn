import {
	cusEntsToUsage,
	cusEntToStartingBalance,
	isEntityScopedCusEnt,
} from "@autumn/shared";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../../models/subject/workerFullSubject.js";

/**
 * Legacy `getOverageCusEntUpdates`: the kept row only carries the deleted usage as overage, so its own grant is
 * cancelled (granted 0), its balance is the negated usage, and it never resets. Per entity on a map row.
 */
export const overageCarrierToRowChange = ({
	carrier,
	deletedRows,
	entityId,
	usage,
}: {
	carrier: WorkerFullCustomerEntitlementWithProduct;
	deletedRows: WorkerFullCustomerEntitlementWithProduct[];
	entityId: string | null;
	usage: number;
}): RowChange => {
	const cancelledGrant = -cusEntToStartingBalance({ cusEnt: carrier });
	const resets = { next_reset_at: null, reset_cycle_anchor: null };
	const isBalanceColumnRow =
		!isEntityScopedCusEnt(carrier) || carrier.internal_entity_id !== null;

	if (isBalanceColumnRow)
		return {
			table: "customerEntitlements",
			op: "update",
			id: carrier.id,
			before: {
				balance: carrier.balance,
				additional_balance: carrier.additional_balance,
				adjustment: carrier.adjustment,
				next_reset_at: carrier.next_reset_at,
				reset_cycle_anchor: carrier.reset_cycle_anchor,
			},
			after: {
				balance: -usage,
				additional_balance: 0,
				adjustment: cancelledGrant,
				...resets,
			},
		};

	const entityKeys = entityId
		? [entityId]
		: Object.keys(carrier.entities ?? {});
	const entities = { ...(carrier.entities ?? {}) };
	for (const entityKey of entityKeys) {
		const entityBalance = entities[entityKey];
		if (!entityBalance) continue;
		entities[entityKey] = {
			...entityBalance,
			balance: -cusEntsToUsage({ cusEnts: deletedRows, entityId: entityKey }),
			additional_balance: 0,
			adjustment: cancelledGrant,
		};
	}
	return {
		table: "customerEntitlements",
		op: "update",
		id: carrier.id,
		before: {
			entities: carrier.entities,
			next_reset_at: carrier.next_reset_at,
			reset_cycle_anchor: carrier.reset_cycle_anchor,
		},
		after: { entities, ...resets },
	};
};
