import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { isOnReplacedStripeSubscription } from "../utils/isOnReplacedStripeSubscription";

/**
 * Kept plans the replacement subscription bills from now, as Stripe prorates them on create up to its anchor.
 * A backdate recreate's live subscription already paid them through that anchor.
 */
export const keptCustomerProductsBilledByReplacement = ({
	billingContext,
	keptCustomerProducts,
}: {
	billingContext: BillingContext;
	keptCustomerProducts: FullCusProduct[];
}): FullCusProduct[] => {
	if (isBackdateRecreate({ billingContext })) return [];

	return keptCustomerProducts.filter((customerProduct) =>
		isOnReplacedStripeSubscription({ billingContext, customerProduct }),
	);
};
