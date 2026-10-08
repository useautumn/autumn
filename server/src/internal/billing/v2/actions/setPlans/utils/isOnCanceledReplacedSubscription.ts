import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { isOnReplacedStripeSubscription } from "./isOnReplacedStripeSubscription";
import { replacementReason } from "./replacementReason";

/** Stripe already ended the replaced subscription without a credit, and its replacement only bills from now. */
export const isOnCanceledReplacedSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
	customerProduct: FullCusProduct;
}) =>
	replacementReason({ billingContext }) === "canceled" &&
	isOnReplacedStripeSubscription({ billingContext, customerProduct });
