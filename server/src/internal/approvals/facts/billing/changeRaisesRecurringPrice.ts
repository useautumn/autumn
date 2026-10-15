import {
	type FullCusProduct,
	isCustomerProductCanceling,
} from "@autumn/shared";
import { customerProductsToRecurringTotals } from "./customerProductsToRecurringTotals";

/**
 * Whether any billing interval costs more after the change. Catches raises the
 * next invoice doesn't show, like annual units on a plan billed monthly.
 */
export const changeRaisesRecurringPrice = ({
	incoming,
	outgoing,
	currency,
}: {
	incoming: FullCusProduct[];
	outgoing: FullCusProduct[];
	currency: string;
}): boolean => {
	const before = customerProductsToRecurringTotals({
		customerProducts: outgoing,
		currency,
	});
	// An end-of-cycle change lists the plan it replaces as incoming until it ends; it stops billing.
	const after = customerProductsToRecurringTotals({
		customerProducts: incoming.filter(
			(customerProduct) => !isCustomerProductCanceling(customerProduct),
		),
		currency,
	});
	return [...after].some(
		([interval, total]) => total > (before.get(interval) ?? 0),
	);
};
