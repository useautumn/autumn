import {
	type BillingPlanOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

export const lockCustomerCurrencyToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => {
	const { lockCustomerCurrency } = autumnBillingPlan;
	if (!lockCustomerCurrency) return [];
	return [
		toBillingPlanUpdateOp({
			table: "customer",
			id: lockCustomerCurrency.internalCustomerId,
			set: { currency: lockCustomerCurrency.currency },
		}),
	];
};
