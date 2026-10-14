import {
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductPaidRecurring,
	isCustomerProductTrialing,
} from "@autumn/shared";

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
