import {
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductPaidRecurring,
	isCustomerProductTrialing,
} from "@autumn/shared";

/** A running paid plan no Stripe subscription bills, so no Stripe period is open to carry into. */
export const isUnbilledByStripe = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}) =>
	customerProduct.status !== CusProductStatus.Scheduled &&
	isCustomerProductPaidRecurring(customerProduct) &&
	!customerProduct.subscription_ids?.length &&
	!isCustomerProductTrialing(customerProduct, { nowMs: now });
