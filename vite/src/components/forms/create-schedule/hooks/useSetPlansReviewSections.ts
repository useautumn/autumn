import type { ProductV2, SetPlansPreviewWarning } from "@autumn/shared";
import { useMemo } from "react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { balanceChangesToReviewSection } from "../utils/review/balanceChangesToReviewSection";
import { customerStatePlansToReviewPlans } from "../utils/review/customerStatePlansToReviewPlans";
import { phaseReviewPlans } from "../utils/review/phaseReviewPlans";
import { planChangesToReviewSection } from "../utils/review/planChangesToReviewSection";
import { processorItemsToReviewSection } from "../utils/review/processorItemsToReviewSection";
import { recurringTotalLabel } from "../utils/review/recurringTotalLabel";
import { reviewPlanPriceLabel } from "../utils/review/reviewPlanPriceLabel";
import type { ReviewChangeSection } from "../utils/review/types/reviewChange";

export type SetPlansReviewSections = {
	warnings: SetPlansPreviewWarning[];
	plans: ReviewChangeSection;
	balances: ReviewChangeSection;
	processor: ReviewChangeSection;
};

export function useSetPlansReviewSections(): SetPlansReviewSections | null {
	const { preview, error, products, features, formValues, nowMs } =
		useCreateScheduleFormContext();
	const { existingPlans } = useCustomerStateContext();
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	return useMemo(() => {
		if (!preview || error) return null;

		const displayProducts = products.map(productForDisplay);

		return {
			warnings: preview.warnings,
			plans: planChangesToReviewSection({
				preview,
				declaredPlansByPhase: formValues.phases.map((phase) =>
					phaseReviewPlans({
						phasePlans: phase.plans,
						unscheduledPlans: formValues.unscheduledPlans,
						products,
						productForDisplay,
					}),
				),
				existingPlans: customerStatePlansToReviewPlans({
					plans: existingPlans,
					products,
					productForDisplay,
				}),
				nowMs,
				context: {
					products: displayProducts,
					priceLabelFor: (product: ProductV2) =>
						reviewPlanPriceLabel({
							product,
							features,
							currency: displayCurrency,
						}),
					phaseTotalFor: (phaseProducts: ProductV2[]) =>
						recurringTotalLabel({
							products: phaseProducts,
							currency: displayCurrency,
						}),
				},
			}),
			balances: balanceChangesToReviewSection({
				phases: preview.phases,
				features,
				nowMs,
			}),
			processor: processorItemsToReviewSection({ preview, nowMs }),
		};
	}, [
		preview,
		error,
		formValues,
		existingPlans,
		products,
		features,
		nowMs,
		displayCurrency,
		productForDisplay,
	]);
}
