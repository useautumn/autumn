import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { phaseReviewPlans } from "../utils/review/phaseReviewPlans";
import { recurringTotalLabel } from "../utils/review/recurringTotalLabel";
import { reviewPlansToProducts } from "../utils/review/reviewPlansToProducts";

/** The phase's recurring base total, counting ongoing plans the way the review does. */
export function usePhaseRecurringTotal({
	phaseIndex,
}: {
	phaseIndex: number;
}): string | undefined {
	const { formValues, products } = useCustomerStateContext();
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	const reviewPlans = phaseReviewPlans({
		phasePlans: formValues.phases[phaseIndex]?.plans ?? [],
		unscheduledPlans: formValues.unscheduledPlans,
		products,
		productForDisplay,
	});

	return recurringTotalLabel({
		products: reviewPlansToProducts(reviewPlans),
		currency: displayCurrency,
	});
}
