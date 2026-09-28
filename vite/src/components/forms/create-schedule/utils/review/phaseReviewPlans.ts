import type { ProductV2 } from "@autumn/shared";
import type { CustomerStatePlan } from "@/components/forms/customer-state/customerStateSchema";
import { customerStatePlansToReviewPlans } from "./customerStatePlansToReviewPlans";
import type { ReviewPlan } from "./types/reviewChange";

/** Unscheduled plans stay active through every phase, so each phase declares them too. */
export const phaseReviewPlans = ({
	phasePlans,
	unscheduledPlans,
	products,
	productForDisplay,
}: {
	phasePlans: CustomerStatePlan[];
	unscheduledPlans: CustomerStatePlan[];
	products: ProductV2[];
	productForDisplay: (product: ProductV2) => ProductV2;
}): ReviewPlan[] =>
	customerStatePlansToReviewPlans({
		plans: [...phasePlans, ...unscheduledPlans],
		products,
		productForDisplay,
	});
