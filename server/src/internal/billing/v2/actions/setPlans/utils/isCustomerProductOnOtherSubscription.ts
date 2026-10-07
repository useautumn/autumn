import type { FullCusProduct } from "@autumn/shared";

/** Billed by a Stripe subscription other than the given one; a row not yet on any is new to it. */
export const isCustomerProductOnOtherSubscription = ({
	customerProduct,
	stripeSubscriptionId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId: string;
}) =>
	(customerProduct.subscription_ids?.length ?? 0) > 0 &&
	!customerProduct.subscription_ids?.includes(stripeSubscriptionId);
