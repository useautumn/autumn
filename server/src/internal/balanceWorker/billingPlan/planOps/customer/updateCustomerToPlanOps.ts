import {
	type BillingPlanOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";
import { withDefinedColumns } from "../utils/withDefinedColumns.js";

export const updateCustomerToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => {
	const { updateCustomer } = autumnBillingPlan;
	if (!updateCustomer) return [];
	const set = withDefinedColumns({ updates: updateCustomer.updates });
	if (!set) return [];
	return [
		toBillingPlanUpdateOp({
			table: "customer",
			id: updateCustomer.customer.internal_id,
			set,
		}),
	];
};
