import { cp, type FullCusProduct } from "@autumn/shared";

export const isFreePhasePlaceholderCustomerProduct = (
	customerProduct: FullCusProduct,
) =>
	cp(customerProduct).free().recurring().valid &&
	Boolean(customerProduct.ended_at);
