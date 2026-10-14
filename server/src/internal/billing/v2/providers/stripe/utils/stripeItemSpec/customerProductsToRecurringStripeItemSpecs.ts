import {
	type BillingContext,
	customerProductsHaveDuplicateProductId,
	type FullCusProduct,
	type StripeItemSpec,
} from "@autumn/shared";
import { customerProductToStripeItemSpecs } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

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
		const isDuplicateProductId = customerProductsHaveDuplicateProductId({
			customerProducts,
			productId: customerProduct.product.id,
		});

		const { recurringItems } = customerProductToStripeItemSpecs({
			ctx,
			billingContext,
			customerProduct,
			options: { isDuplicateProductId },
		});

		for (const item of recurringItems) {
			if (item.stripeInlinePrice) {
				inlineSpecs.push(item);
				continue;
			}

			const priceId = item.stripePriceId!;
			const existing = storedPriceSpecs.get(priceId);

			if (existing) {
				if (item.quantity === undefined && existing.quantity === undefined) {
				} else {
					existing.quantity = (existing.quantity ?? 0) + (item.quantity ?? 0);
				}
			} else {
				storedPriceSpecs.set(priceId, item);
			}
		}
	}

	return [...Array.from(storedPriceSpecs.values()), ...inlineSpecs];
};
