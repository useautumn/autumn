import {
	cusProductToProcessorType,
	type FullCusProduct,
	isCustomerProductPaidRecurring,
	isCustomerProductTrialing,
	ProcessorType,
} from "@autumn/shared";

/** A paid Stripe-processed plan still in its trial with no Stripe subscription behind it. */
export const isCustomerProductAutumnManagedTrial = ({
	customerProduct,
	nowMs,
}: {
	customerProduct?: FullCusProduct;
	nowMs: number;
}): boolean =>
	!!customerProduct &&
	!customerProduct.subscription_ids?.length &&
	cusProductToProcessorType(customerProduct) === ProcessorType.Stripe &&
	isCustomerProductPaidRecurring(customerProduct) &&
	!!isCustomerProductTrialing(customerProduct, { nowMs });
