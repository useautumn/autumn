import type { FullCusProduct } from "@autumn/shared";

export const hasPooledBalanceDependency = (cusProduct: FullCusProduct) =>
	cusProduct.customer_entitlements.some(
		(cusEnt) => cusEnt.is_pooled_balance || cusEnt.pooled_contribution_id,
	);
