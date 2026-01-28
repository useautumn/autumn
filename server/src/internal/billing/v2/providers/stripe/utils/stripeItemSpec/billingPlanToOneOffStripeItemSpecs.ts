import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types";

export const billingPlanToOneOffStripeItemSpecs = ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const newCustomerProducts = autumnBillingPlan.insertCustomerProducts;

	const oneOffItems = newCustomerProducts.flatMap((customerProduct) => {
		const { oneOffItems } = customerProductToStripeItemSpecs({
			ctx,
			customerProduct,
		});
		return oneOffItems;
	});

	return oneOffItems;
};
