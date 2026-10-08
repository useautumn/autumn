import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { isOnReplacedStripeSubscription } from "./isOnReplacedStripeSubscription";
import { replacementReason } from "./replacementReason";

/** Stripe never collected the replaced subscription's current period, so its plans have no unused time to credit. */
export const isOnUncollectedReplacedSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
	customerProduct: FullCusProduct;
}) =>
	replacementReason({ billingContext }) === "uncollected" &&
	isOnReplacedStripeSubscription({ billingContext, customerProduct });
