import { cp } from "@autumn/shared";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan";

export const billingPlanToNewActiveCustomerProduct = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	return autumnBillingPlan.insertCustomerProducts?.find(
		(customerProduct) => cp(customerProduct).hasActiveStatus().valid,
	);
};
