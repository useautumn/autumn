/**
 * Plan-scoped id change — every version row moves, plus plan-id references
 * (reward programs, rewards, RevenueCat mappings). customer_products.product_id
 * stays untouched: it is a historical snapshot, readers match on internal ids.
 */
export type RenameProductPlan = {
	planId: string;
	toId: string;
};
