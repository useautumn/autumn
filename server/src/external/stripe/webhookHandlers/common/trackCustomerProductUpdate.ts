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
 *
 * Note: callers iterating `customerProducts` while this helper (or
 * `trackCustomerProductDeletion`) may run must iterate over a snapshot, e.g.
 * `for (const cp of [...customerProducts])`, to avoid iterator invalidation.
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

	updatedCustomerProducts.push({ customerProduct, updates });

	const updatedProduct = { ...customerProduct, ...updates } as FullCusProduct;

	const idx = customerProducts.findIndex((cp) => cp.id === customerProduct.id);
	if (idx >= 0) {
		customerProducts[idx] = updatedProduct;
	}

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
 * - Adds to deletedCustomerProducts list for logging/audit
 * - Removes from customerProducts array in place so subsequent tasks see the change
 * - Removes from fullCustomer.customer_products so actions can see the change
 *
 * Note: callers iterating `customerProducts` while this helper (or
 * `trackCustomerProductUpdate`) may run must iterate over a snapshot, e.g.
 * `for (const cp of [...customerProducts])`, to avoid iterator invalidation.
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

	deletedCustomerProducts.push(customerProduct);

	const idx = customerProducts.findIndex((cp) => cp.id === customerProduct.id);
	if (idx >= 0) {
		customerProducts.splice(idx, 1);
	}

	const fullCustomerIdx = fullCustomer.customer_products.findIndex(
		(cp) => cp.id === customerProduct.id,
	);
	if (fullCustomerIdx >= 0) {
		fullCustomer.customer_products.splice(fullCustomerIdx, 1);
	}
};

/**
 * Tracks a customer product insertion for subscription event workflows.
 * - Adds to insertedCustomerProducts list for logging/audit
 * - Adds to customerProducts array in place so subsequent tasks see the change
 * - Note: fullCustomer.customer_products should already be updated by the action
 */
export const trackCustomerProductInsertion = ({
	eventContext,
	customerProduct,
}: {
	eventContext:
		| StripeSubscriptionDeletedContext
		| StripeSubscriptionUpdatedContext;
	customerProduct: FullCusProduct;
}): void => {
	const { customerProducts, insertedCustomerProducts } = eventContext;

	insertedCustomerProducts.push(customerProduct);

	const exists = customerProducts.some((cp) => cp.id === customerProduct.id);
	if (!exists) {
		customerProducts.push(customerProduct);
	}
};
