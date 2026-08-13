import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullCustomer,
	InsertCustomerProduct,
} from "@autumn/shared";

export type BillingChangeCollector = {
	/** Live customer the tasks read and the trackers mutate. */
	fullCustomer: FullCustomer;
	/** Pre-change snapshot taken at construction — the flush diffs against this,
	 * and `fullCustomer` is already mutated by the time it runs. */
	originalFullCustomer: FullCustomer;
	/** Products in scope, mutated in place by the trackers — iterate a snapshot
	 * (`[...customerProducts]`) while tracking. */
	customerProducts: FullCusProduct[];
	/** Wider than the payload's `CustomerProductUpdates` because tasks sync
	 * columns the plan schema doesn't model (e.g. `collection_method`). */
	updatedCustomerProducts: {
		customerProduct: FullCusProduct;
		updates: Partial<InsertCustomerProduct>;
	}[];
	insertedCustomerProducts: FullCusProduct[];
	deletedCustomerProducts: FullCusProduct[];
	billingChangeTags: Set<string>;
};

export const createBillingChangeCollector = ({
	fullCustomer,
	customerProducts = [],
}: {
	fullCustomer: FullCustomer;
	customerProducts?: FullCusProduct[];
}): BillingChangeCollector => ({
	fullCustomer,
	originalFullCustomer: structuredClone(fullCustomer),
	customerProducts,
	updatedCustomerProducts: [],
	insertedCustomerProducts: [],
	deletedCustomerProducts: [],
	billingChangeTags: new Set<string>(),
});

/** Records an update and applies it in place so later tasks see the change. */
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

/** Records a deletion and removes the product in place so later tasks skip it. */
export const trackCustomerProductDeletion = ({
	collector,
	customerProduct,
}: {
	collector: BillingChangeCollector;
	customerProduct: FullCusProduct;
}): void => {
	const { customerProducts, fullCustomer, deletedCustomerProducts } = collector;

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

/** Records an insertion; `fullCustomer.customer_products` is the action's job. */
export const trackCustomerProductInsertion = ({
	collector,
	customerProduct,
}: {
	collector: BillingChangeCollector;
	customerProduct: FullCusProduct;
}): void => {
	const { customerProducts, insertedCustomerProducts } = collector;

	insertedCustomerProducts.push(customerProduct);

	const exists = customerProducts.some((cp) => cp.id === customerProduct.id);
	if (!exists) {
		customerProducts.push(customerProduct);
	}
};

/**
 * Records a signal (e.g. "trial_ended") for the payload's `tags`. Only call it
 * once the condition is actually detected — tags describe what happened.
 */
export const addBillingChangeTag = ({
	collector,
	tag,
}: {
	collector: BillingChangeCollector;
	tag: string;
}): void => {
	collector.billingChangeTags.add(tag);
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
