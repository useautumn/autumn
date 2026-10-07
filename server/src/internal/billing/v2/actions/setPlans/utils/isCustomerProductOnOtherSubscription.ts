import type { FullCusProduct } from "@autumn/shared";

/** A row not yet on any subscription is new to this one, not on another. */
export const isCustomerProductOnOtherSubscription = ({
	customerProduct,
	stripeSubscriptionId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId: string;
}) =>
	(customerProduct.subscription_ids?.length ?? 0) > 0 &&
	!customerProduct.subscription_ids?.includes(stripeSubscriptionId);
