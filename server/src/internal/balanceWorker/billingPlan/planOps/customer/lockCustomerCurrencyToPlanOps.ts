import {
	type BillingPlanOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

/** Locks or relocks the currency; callers only send it when no live paid product holds the old one. */
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
