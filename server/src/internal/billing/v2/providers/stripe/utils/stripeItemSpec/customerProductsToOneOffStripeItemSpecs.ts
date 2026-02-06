import type { BillingContext, StripeItemSpec } from "@autumn/shared";
import { customerProductToStripeItemSpecs } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import type { FullCusProduct } from "@shared/models/cusProductModels/cusProductModels";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Convert customer products to one-off stripe item specs.
 */
export const customerProductsToOneOffStripeItemSpecs = ({
	ctx,
	billingContext,
	customerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
}): StripeItemSpec[] => {
	const oneOffItemSpecs: StripeItemSpec[] = [];

	for (const customerProduct of customerProducts) {
		const { oneOffItems } = customerProductToStripeItemSpecs({
			ctx,
			billingContext,
			customerProduct,
		});

		oneOffItemSpecs.push(...oneOffItems);
	}

	return oneOffItemSpecs;
};
