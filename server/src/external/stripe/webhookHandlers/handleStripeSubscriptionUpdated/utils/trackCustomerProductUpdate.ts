import type { FullCusProduct } from "@autumn/shared";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

/**
 * Tracks a customer product update for the subscription updated workflow.
 * - Adds to updatedCustomerProducts list for logging/audit
 * - Updates customerProducts array in place so subsequent tasks see the change
 */
export const trackCustomerProductUpdate = ({
	subscriptionUpdatedContext,
	customerProduct,
	updates,
}: {
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
	customerProduct: FullCusProduct;
	updates: Partial<FullCusProduct>;
}): FullCusProduct => {
	const { customerProducts, updatedCustomerProducts } =
		subscriptionUpdatedContext;

	// Track the update
	updatedCustomerProducts.push({ customerProduct, updates });

	// Update in place
	const idx = customerProducts.findIndex((cp) => cp.id === customerProduct.id);
	const updatedProduct = { ...customerProduct, ...updates } as FullCusProduct;

	if (idx >= 0) {
		customerProducts[idx] = updatedProduct;
	}

	return updatedProduct;
};
