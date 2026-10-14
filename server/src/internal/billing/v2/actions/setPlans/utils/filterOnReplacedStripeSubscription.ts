import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { isOnReplacedStripeSubscription } from "./isOnReplacedStripeSubscription";

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
