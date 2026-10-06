import type { LineItem } from "@autumn/shared";

/** Accrued usage of a plan no Stripe subscription billed: no Stripe period holds it, so proration never drops it. */
export const isUsageNoSubscriptionBilled = ({ context }: LineItem) =>
	context.billingTiming === "in_arrear" &&
	context.customerProduct !== undefined &&
	!context.customerProduct.subscription_ids?.length;
