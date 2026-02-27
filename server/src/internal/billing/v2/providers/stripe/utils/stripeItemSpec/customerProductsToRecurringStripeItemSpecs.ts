import type {
	BillingContext,
	FullCusProduct,
	StripeItemSpec,
} from "@autumn/shared";
import { customerProductToStripeItemSpecs } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Converts customer products to recurring stripe item specs.
 * Deduplicates stored-price items by stripePriceId (accumulating quantities).
 * Entity-scoped inline items are never deduplicated — each entity gets its own item.
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
	const storedPriceSpecs = new Map<string, StripeItemSpec>();
	const inlineSpecs: StripeItemSpec[] = [];

	for (const customerProduct of customerProducts) {
		const { recurringItems } = customerProductToStripeItemSpecs({
			ctx,
			billingContext,
			customerProduct,
		});

		for (const item of recurringItems) {
			// Entity-scoped inline items are never deduplicated
			if (item.stripeInlinePrice) {
				inlineSpecs.push(item);
				continue;
			}

			const priceId = item.stripePriceId!;
			const existing = storedPriceSpecs.get(priceId);

			if (existing) {
				// Metered prices: quantity is undefined, keep undefined
				if (item.quantity === undefined && existing.quantity === undefined) {
					// Both metered — keep as-is
				} else {
					// Licensed prices — accumulate quantity
					existing.quantity = (existing.quantity ?? 0) + (item.quantity ?? 0);
				}
			} else {
				storedPriceSpecs.set(priceId, item);
			}
		}
	}

	return [...Array.from(storedPriceSpecs.values()), ...inlineSpecs];
};
