import {
	type BillingPlanOp,
	toBillingPlanIncrementOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type {
	AutumnBillingPlan,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import { withDefinedColumns } from "../utils/withDefinedColumns.js";

/** Field updates replace columns; otherwise a balance change is a delta, as `updateCustomerEntitlements` applies them. */
const updateToPlanOps = ({
	update,
}: {
	update: UpdateCustomerEntitlement;
}): BillingPlanOp[] => {
	const { customerEntitlement, updates, balanceChange = 0 } = update;
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
	if (balanceChange === 0) return [];
	return [
		toBillingPlanIncrementOp({
			id: customerEntitlement.id,
			add: { balance: balanceChange },
		}),
	];
};

export const updateCustomerEntitlementsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	(autumnBillingPlan.updateCustomerEntitlements ?? []).flatMap((update) =>
		updateToPlanOps({ update }),
	);
