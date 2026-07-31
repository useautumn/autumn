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

/**
 * Splits a subscription event's customer product changes into the outgoing and
 * incoming sets the pooled transition compute expects.
 *
 * A status write to Active only counts as incoming when the product was NOT
 * already contributing. past_due -> active is a payment recovery, not a new
 * attachment, and re-admitting it would plan a second contribution for a source
 * entitlement that already holds one.
 */
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
		// Already-contributing products (Active or PastDue) are not re-admitted:
		// a payment recovery writes status Active without being an attachment.
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
