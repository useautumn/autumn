import {
	type BillingPlanOp,
	toBillingPlanAddRolloversOp,
	toBillingPlanIncrementOp,
	toBillingPlanMoveEntriesOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type {
	AutumnBillingPlan,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import { withDefinedColumns } from "../utils/withDefinedColumns.js";

/** Field updates replace columns; otherwise moves re-key entries, then balance and entry deltas apply, as `updateCustomerEntitlements` orders them. */
const updateToBalanceOps = ({
	update,
}: {
	update: UpdateCustomerEntitlement;
}): BillingPlanOp[] => {
	const {
		customerEntitlement,
		updates,
		balanceChange = 0,
		entityBalanceChanges = {},
		moveEntityBalances = {},
	} = update;
	if (updates) {
		const set = withDefinedColumns({ updates });
		return set
			? [
					toBillingPlanUpdateOp({
						table: "customerEntitlements",
						id: customerEntitlement.id,
						set,
					}),
				]
			: [];
	}
	const moveOps =
		Object.keys(moveEntityBalances).length > 0
			? [
					toBillingPlanMoveEntriesOp({
						id: customerEntitlement.id,
						moves: moveEntityBalances,
					}),
				]
			: [];
	const entityEntries = Object.entries(entityBalanceChanges);
	if (balanceChange === 0 && entityEntries.length === 0) return moveOps;
	return [
		...moveOps,
		toBillingPlanIncrementOp({
			id: customerEntitlement.id,
			add: balanceChange === 0 ? {} : { balance: balanceChange },
			addEntries:
				entityEntries.length > 0
					? {
							entities: Object.fromEntries(
								entityEntries.map(([entityId, delta]) => [
									entityId,
									{ balance: delta },
								]),
							),
						}
					: undefined,
		}),
	];
};

/** The grant's columns or deltas, then the rollovers carried onto it, as the Postgres lane orders them. */
const updateToPlanOps = ({
	update,
}: {
	update: UpdateCustomerEntitlement;
}): BillingPlanOp[] => [
	...updateToBalanceOps({ update }),
	...toBillingPlanAddRolloversOp({
		id: update.customerEntitlement.id,
		rows: update.insertRollovers ?? [],
	}),
];

export const updateCustomerEntitlementsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	(autumnBillingPlan.updateCustomerEntitlements ?? []).flatMap((update) =>
		updateToPlanOps({ update }),
	);
