import {
	type FullCusProduct,
	secondsToMs,
	timestampsMatch,
} from "@autumn/shared";
import type Stripe from "stripe";

/** Products whose pending anchor reset is the anchor the Stripe subscription now has. */
export const findBillingCycleAnchorResetCustomerProductIds = ({
	stripeSubscription,
	customerProducts,
}: {
	stripeSubscription: Pick<Stripe.Subscription, "billing_cycle_anchor">;
	customerProducts: FullCusProduct[];
}): string[] => {
	const stripeAnchorMs = secondsToMs(stripeSubscription.billing_cycle_anchor);
	return customerProducts
		.filter(
			(customerProduct) =>
				typeof customerProduct.billing_cycle_anchor_resets_at === "number" &&
				timestampsMatch(
					customerProduct.billing_cycle_anchor_resets_at,
					stripeAnchorMs,
				),
		)
		.map((customerProduct) => customerProduct.id);
};
