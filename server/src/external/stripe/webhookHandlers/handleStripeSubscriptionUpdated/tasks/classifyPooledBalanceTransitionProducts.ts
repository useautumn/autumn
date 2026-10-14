import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
	type InsertCustomerProduct,
} from "@autumn/shared";

export type PooledBalanceTransitionUpdate = {
	customerProduct: FullCusProduct;
	updates: Partial<InsertCustomerProduct>;
};

export const classifyPooledBalanceTransitionProducts = ({
	updatedCustomerProducts,
	insertedCustomerProducts,
}: {
	updatedCustomerProducts: PooledBalanceTransitionUpdate[];
	insertedCustomerProducts: FullCusProduct[];
}): {
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
} => {
	const outgoing = new Map<string, FullCusProduct>();
	const incoming = new Map<string, FullCusProduct>();

	for (const { customerProduct, updates } of updatedCustomerProducts) {
		if (updates.status === CusProductStatus.Expired) {
			outgoing.set(customerProduct.id, customerProduct);
		}
		if (
			updates.status === CusProductStatus.Active &&
			!customerProductHasActiveStatus(customerProduct)
		) {
			incoming.set(customerProduct.id, {
				...customerProduct,
				...updates,
			} as FullCusProduct);
		}
	}

	for (const customerProduct of insertedCustomerProducts) {
		if (customerProductHasActiveStatus(customerProduct)) {
			incoming.set(customerProduct.id, customerProduct);
		}
	}

	return {
		outgoingCustomerProducts: Array.from(outgoing.values()),
		incomingCustomerProducts: Array.from(incoming.values()),
	};
};
