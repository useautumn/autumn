import { cp, type FullCusProduct } from "@autumn/shared";

/** A free plan that ends at a later phase rides a $0 Stripe placeholder until then. */
export const isFreePhasePlaceholderCustomerProduct = (
	customerProduct: FullCusProduct,
) =>
	cp(customerProduct).free().recurring().valid &&
	Boolean(customerProduct.ended_at);
