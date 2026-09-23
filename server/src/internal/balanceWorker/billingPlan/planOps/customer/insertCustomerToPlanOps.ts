import {
	type BillingPlanOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

export const insertCustomerToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => {
	const { insertCustomer } = autumnBillingPlan;
	if (!insertCustomer) return [];
	return [toBillingPlanInsertOp({ table: "customer", row: insertCustomer })];
};
