import type { FullCusProduct, InsertCustomerProduct } from "@autumn/shared";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

type SubscriptionEventContext =
	| StripeSubscriptionUpdatedContext
	| StripeSubscriptionDeletedContext;

/**
 * Tracks a customer product update for subscription event workflows.
 * - Adds to updatedCustomerProducts list for logging/audit
 * - Updates customerProducts array in place so subsequent tasks see the change
 * - Updates fullCustomer.customer_products so actions can see the change
 */
export const trackCustomerProductUpdate = ({
	eventContext,
	customerProduct,
	updates,
}: {
	eventContext: SubscriptionEventContext;
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

/**
 * Tracks a customer product deletion for subscription event workflows.
 * - Adds to deletedCustomerProducts list for logging/audit (only for deleted context)
 * - Removes from customerProducts array in place so subsequent tasks see the change
 * - Removes from fullCustomer.customer_products so actions can see the change
 */
export const trackCustomerProductDeletion = ({
	eventContext,
	customerProduct,
}: {
	eventContext:
		| StripeSubscriptionDeletedContext
		| StripeSubscriptionUpdatedContext;
	customerProduct: FullCusProduct;
}): void => {
	const { customerProducts, fullCustomer, deletedCustomerProducts } =
		eventContext;

	// Track the deletion for logging
	deletedCustomerProducts.push(customerProduct);

	// Remove from customerProducts array
	const idx = customerProducts.findIndex((cp) => cp.id === customerProduct.id);
	if (idx >= 0) {
		customerProducts.splice(idx, 1);
	}

	// Also remove from fullCustomer.customer_products so actions can see the change
	const fullCustomerIdx = fullCustomer.customer_products.findIndex(
		(cp) => cp.id === customerProduct.id,
	);
	if (fullCustomerIdx >= 0) {
		fullCustomer.customer_products.splice(fullCustomerIdx, 1);
	}
};
