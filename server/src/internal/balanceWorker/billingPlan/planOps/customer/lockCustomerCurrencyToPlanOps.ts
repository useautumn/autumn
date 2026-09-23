import {
	type BillingPlanOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

/** The first paid attach locks the currency; a customer that already has one keeps it. */
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
			whereUnset: true,
		}),
	];
};
