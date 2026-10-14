import type { FullCusProduct, InsertCustomerProduct } from "@autumn/shared";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

type SubscriptionEventContext =
	| StripeSubscriptionUpdatedContext
	| StripeSubscriptionDeletedContext;

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
