import type { ProductV2, SetPlansPreviewWarning } from "@autumn/shared";
import { useMemo } from "react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { getBasePriceLabel } from "@/components/forms/customer-state/customerStatePlanPrice";
import type { CustomerStatePlan } from "@/components/forms/customer-state/customerStateSchema";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { balanceChangesToReviewSection } from "../utils/review/balanceChangesToReviewSection";
import { planChangesToReviewSection } from "../utils/review/planChangesToReviewSection";
import { processorChangesToReviewSection } from "../utils/review/processorChangesToReviewSection";
import type { ReviewChangeSection } from "../utils/review/types/reviewChange";

export type SetPlansReviewSections = {
	warnings: SetPlansPreviewWarning[];
	plans: ReviewChangeSection;
	balances: ReviewChangeSection;
	processor: ReviewChangeSection;
};

const toPlanIds = (plans: CustomerStatePlan[]) =>
	plans.map((plan) => plan.productId).filter(Boolean);

/** Per-phase plan, balance and Stripe changes from the set_plans preview. */
export function useSetPlansReviewSections(): SetPlansReviewSections | null {
	const { preview, isPreviewLoading, error, products, features, formValues } =
		useCreateScheduleFormContext();
	const { existingPlans } = useCustomerStateContext();
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	return useMemo(() => {
		if (!preview || isPreviewLoading || error) return null;

		const unscheduledPlanIds = toPlanIds(formValues.unscheduledPlans);
		const priceLabelFor = (product: ProductV2) =>
			getBasePriceLabel({
				product: productForDisplay(product),
				currency: displayCurrency,
			});

		return {
			warnings: preview.warnings,
			plans: planChangesToReviewSection({
				preview,
				declaredPlanIdsByPhase: formValues.phases.map((phase) => [
					...toPlanIds(phase.plans),
					...unscheduledPlanIds,
				]),
				existingPlanIds: toPlanIds(existingPlans),
				context: { products, priceLabelFor },
			}),
			balances: balanceChangesToReviewSection({
				phases: preview.phases,
				features,
			}),
			processor: processorChangesToReviewSection({ preview }),
		};
	}, [
		preview,
		isPreviewLoading,
		error,
		formValues,
		existingPlans,
		products,
		features,
		displayCurrency,
		productForDisplay,
	]);
}
