import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";

export const billingPlanToOneOffStripeItemSpecs = ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const newCustomerProducts = autumnBillingPlan.insertCustomerProducts;

	const oneOffItems = newCustomerProducts.flatMap((customerProduct) => {
		const { oneOffItems } = customerProductToStripeItemSpecs({
			ctx,
			billingContext,
			customerProduct,
		});
		return oneOffItems;
	});

	return oneOffItems;
};
