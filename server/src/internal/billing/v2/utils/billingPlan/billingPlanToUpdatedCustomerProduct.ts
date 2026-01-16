import type { FullCusProduct } from "@autumn/shared";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan";

export const billingPlanToUpdatedCustomerProduct = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): FullCusProduct | undefined => {
	const { updateCustomerProduct } = autumnBillingPlan;

	if (!updateCustomerProduct) return undefined;

	return {
		...updateCustomerProduct.customerProduct,
		...updateCustomerProduct.updates,
	};
};
