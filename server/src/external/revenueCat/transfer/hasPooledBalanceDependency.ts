import type { FullCusProduct } from "@autumn/shared";

/** Pooled credits tie a product to rows owned by its customer; those are not moved. */
export const hasPooledBalanceDependency = (cusProduct: FullCusProduct) =>
	cusProduct.customer_entitlements.some(
		(cusEnt) => cusEnt.is_pooled_balance || cusEnt.pooled_contribution_id,
	);
