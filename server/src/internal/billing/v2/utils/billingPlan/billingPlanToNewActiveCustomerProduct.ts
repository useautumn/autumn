import { cp } from "@autumn/shared";
import type { AutumnBillingPlan } from "@autumn/shared";

export const billingPlanToNewActiveCustomerProduct = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	return autumnBillingPlan.insertCustomerProducts?.find(
		(customerProduct) => cp(customerProduct).hasActiveStatus().valid,
	);
};
