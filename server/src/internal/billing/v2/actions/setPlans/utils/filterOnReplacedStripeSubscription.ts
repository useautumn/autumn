import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { isOnReplacedStripeSubscription } from "./isOnReplacedStripeSubscription";

/** The rows riding the subscription set_plans replaces, which its replacement carries. */
export const filterOnReplacedStripeSubscription = ({
	billingContext,
	customerProducts,
}: {
	billingContext: Pick<BillingContext, "replacedStripeSubscription">;
	customerProducts: FullCusProduct[];
}) =>
	customerProducts.filter((customerProduct) =>
		isOnReplacedStripeSubscription({ billingContext, customerProduct }),
	);
