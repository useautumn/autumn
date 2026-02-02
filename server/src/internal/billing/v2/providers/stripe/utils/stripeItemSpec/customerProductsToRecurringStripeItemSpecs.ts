import type { BillingContext, StripeItemSpec } from "@autumn/shared";
import { customerProductToStripeItemSpecs } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import type { FullCusProduct } from "@shared/models/cusProductModels/cusProductModels";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Convert customer products to recurring stripe item specs.
 * For metered prices (quantity undefined), we preserve undefined as Stripe requires.
 * @param ctx - The context
 * @param billingContext - The billing context
 * @param customerProducts - The customer products
 * @returns The recurring stripe item specs
 */
export const customerProductsToRecurringStripeItemSpecs = ({
	ctx,
	billingContext,
	customerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
}): StripeItemSpec[] => {
	const stripeItemSpecsByPriceId = new Map<string, StripeItemSpec>();

	for (const customerProduct of customerProducts) {
		const { recurringItems } = customerProductToStripeItemSpecs({
			ctx,
			billingContext,
			customerProduct,
		});

		for (const recurringItem of recurringItems) {
			const existingItem = stripeItemSpecsByPriceId.get(
				recurringItem.stripePriceId,
			);

			if (existingItem) {
				// For metered prices, quantity is undefined and should stay undefined
				if (
					recurringItem.quantity === undefined &&
					existingItem.quantity === undefined
				) {
					// Both metered - keep undefined
				} else {
					// Licensed prices - accumulate quantity
					existingItem.quantity =
						(existingItem.quantity ?? 0) + (recurringItem.quantity ?? 0);
				}
			} else {
				stripeItemSpecsByPriceId.set(
					recurringItem.stripePriceId,
					recurringItem,
				);
			}
		}
	}

	return Array.from(stripeItemSpecsByPriceId.values());
};
