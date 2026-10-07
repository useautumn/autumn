import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { isOnReplacedStripeSubscription } from "./isOnReplacedStripeSubscription";

/** Stripe already ended the replaced subscription without a credit, and its replacement only bills from now. */
export const isOnCanceledReplacedSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: Pick<BillingContext, "replacedStripeSubscription">;
	customerProduct: FullCusProduct;
}) =>
	billingContext.replacedStripeSubscription?.status === "canceled" &&
	isOnReplacedStripeSubscription({ billingContext, customerProduct });
