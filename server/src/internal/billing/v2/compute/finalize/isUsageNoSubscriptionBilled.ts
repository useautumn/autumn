import type { LineItem } from "@autumn/shared";

export const isUsageNoSubscriptionBilled = ({ context }: LineItem) =>
	context.billingTiming === "in_arrear" &&
	context.customerProduct !== undefined &&
	!context.customerProduct.subscription_ids?.length;
