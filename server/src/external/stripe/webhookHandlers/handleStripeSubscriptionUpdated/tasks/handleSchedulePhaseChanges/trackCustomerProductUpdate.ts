import type { FullCusProduct, InsertCustomerProduct } from "@autumn/shared";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";

/**
 * Tracks a customer product update for the subscription updated workflow.
 * - Adds to updatedCustomerProducts list for logging/audit
 * - Updates customerProducts array in place so subsequent tasks see the change
 * - Updates fullCustomer.customer_products so actions can see the change
 */
export const trackCustomerProductUpdate = ({
	eventContext,
	customerProduct,
	updates,
}: {
	eventContext: StripeSubscriptionUpdatedContext;
	customerProduct: FullCusProduct;
	updates: Partial<InsertCustomerProduct>;
}): FullCusProduct => {
	const { customerProducts, fullCustomer, updatedCustomerProducts } =
		eventContext;

	// Track the update for logging
	updatedCustomerProducts.push({ customerProduct, updates });

	// Create updated product
	const updatedProduct = { ...customerProduct, ...updates } as FullCusProduct;

	// Update in customerProducts array
	const idx = customerProducts.findIndex((cp) => cp.id === customerProduct.id);
	if (idx >= 0) {
		customerProducts[idx] = updatedProduct;
	}

	// Also update in fullCustomer.customer_products so actions can see the change
	const fullCustomerIdx = fullCustomer.customer_products.findIndex(
		(cp) => cp.id === customerProduct.id,
	);
	if (fullCustomerIdx >= 0) {
		fullCustomer.customer_products[fullCustomerIdx] = updatedProduct;
	}

	return updatedProduct;
};
