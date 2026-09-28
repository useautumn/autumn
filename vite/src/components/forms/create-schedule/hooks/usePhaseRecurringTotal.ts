import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { customerStatePlansToReviewPlans } from "../utils/review/customerStatePlansToReviewPlans";
import { recurringTotalLabel } from "../utils/review/recurringTotalLabel";

/** The phase's recurring base total, counting ongoing plans the way the review does. */
export function usePhaseRecurringTotal({
	phaseIndex,
}: {
	phaseIndex: number;
}): string | undefined {
	const { formValues, products } = useCustomerStateContext();
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	const phasePlans = formValues.phases[phaseIndex]?.plans ?? [];
	const reviewPlans = customerStatePlansToReviewPlans({
		plans: [...phasePlans, ...formValues.unscheduledPlans],
		products,
		productForDisplay,
	});

	return recurringTotalLabel({
		products: reviewPlans.flatMap(({ product }) => (product ? [product] : [])),
		currency: displayCurrency,
	});
}
