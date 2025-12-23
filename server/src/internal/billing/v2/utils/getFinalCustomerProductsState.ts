import type { FullCusProduct } from "@shared/models/cusProductModels/cusProductModels";
import {
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@shared/utils";
import type { BillingContext } from "@/internal/billing/v2/billingContext";

/**
 * Gets the final customer product state after applying add/remove operations.
 * Filters to only products on the current subscription.
 */
export const getFinalCustomerProductsState = ({
	billingContext,
	addCustomerProducts = [],
	removeCustomerProducts = [],
}: {
	billingContext: BillingContext;
	addCustomerProducts?: FullCusProduct[];
	removeCustomerProducts?: FullCusProduct[];
}): FullCusProduct[] => {
	const { fullCustomer, stripeSubscription, stripeSubscriptionSchedule } =
		billingContext;

	// Start with existing products on this subscription
	let customerProducts = stripeSubscription
		? fullCustomer.customer_products.filter(
				(cp) =>
					isCustomerProductOnStripeSubscription({
						customerProduct: cp,
						stripeSubscriptionId: stripeSubscription.id,
					}) ||
					isCustomerProductOnStripeSubscriptionSchedule({
						customerProduct: cp,
						stripeSubscriptionScheduleId: stripeSubscriptionSchedule?.id ?? "",
					}),
			)
		: [];

	// Remove specified products
	customerProducts = customerProducts.filter(
		(cp) =>
			!removeCustomerProducts.some((cpToRemove) => cpToRemove.id === cp.id),
	);

	// Add new products
	customerProducts = [...customerProducts, ...addCustomerProducts];

	return customerProducts;
};
