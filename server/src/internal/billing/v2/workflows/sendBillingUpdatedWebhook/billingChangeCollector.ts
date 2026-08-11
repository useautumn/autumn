import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullCustomer,
	InsertCustomerProduct,
} from "@autumn/shared";

export type BillingChangeCollector = {
	/** FullCustomer the flush reports against. */
	fullCustomer: FullCustomer;
	/** Optional scoped subset (Stripe: products on the subscription) kept in sync. */
	customerProducts?: FullCusProduct[];
	updatedCustomerProducts: {
		customerProduct: FullCusProduct;
		updates: Partial<InsertCustomerProduct>;
	}[];
	insertedCustomerProducts: FullCusProduct[];
	deletedCustomerProducts: FullCusProduct[];
	/** Signals pushed via `addBillingChangeTag`, appended to the payload. */
	billingChangeTags: Set<string>;
};

export const createBillingChangeCollector = ({
	fullCustomer,
	customerProducts,
}: {
	fullCustomer: FullCustomer;
	customerProducts?: FullCusProduct[];
}): BillingChangeCollector => ({
	fullCustomer,
	customerProducts,
	updatedCustomerProducts: [],
	insertedCustomerProducts: [],
	deletedCustomerProducts: [],
	billingChangeTags: new Set<string>(),
});

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
	collector,
	customerProduct,
	updates,
}: {
	collector: BillingChangeCollector;
	customerProduct: FullCusProduct;
	updates: Partial<InsertCustomerProduct>;
}): FullCusProduct => {
	const { customerProducts, fullCustomer, updatedCustomerProducts } = collector;

	updatedCustomerProducts.push({ customerProduct, updates });

	const updatedProduct = { ...customerProduct, ...updates } as FullCusProduct;

	if (customerProducts) {
		const idx = customerProducts.findIndex(
			(cp) => cp.id === customerProduct.id,
		);
		if (idx >= 0) {
			customerProducts[idx] = updatedProduct;
		}
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
	collector,
	customerProduct,
}: {
	collector: BillingChangeCollector;
	customerProduct: FullCusProduct;
}): void => {
	const { customerProducts, fullCustomer, deletedCustomerProducts } = collector;

	deletedCustomerProducts.push(customerProduct);

	if (customerProducts) {
		const idx = customerProducts.findIndex(
			(cp) => cp.id === customerProduct.id,
		);
		if (idx >= 0) {
			customerProducts.splice(idx, 1);
		}
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
	collector,
	customerProduct,
}: {
	collector: BillingChangeCollector;
	customerProduct: FullCusProduct;
}): void => {
	const { customerProducts, insertedCustomerProducts } = collector;

	insertedCustomerProducts.push(customerProduct);

	if (customerProducts) {
		const exists = customerProducts.some((cp) => cp.id === customerProduct.id);
		if (!exists) {
			customerProducts.push(customerProduct);
		}
	}
};

export const collectorToAutumnBillingPlan = (
	collector: BillingChangeCollector,
): AutumnBillingPlan =>
	({
		customerId: collector.fullCustomer.id ?? collector.fullCustomer.internal_id,
		insertCustomerProducts: collector.insertedCustomerProducts,
		updateCustomerProducts: collector.updatedCustomerProducts,
		deleteCustomerProducts: collector.deletedCustomerProducts,
	}) as AutumnBillingPlan;
