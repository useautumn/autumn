import type { FullCusProduct, SyncPlanInstance } from "@autumn/shared";

/** Active linked cusProducts of one plan in the sync plan's scope — one row per instance. */
export const linkedPlanInstances = ({
	linkedCustomerProducts,
	productId,
	syncPlan,
}: {
	linkedCustomerProducts: FullCusProduct[];
	productId: string;
	syncPlan: SyncPlanInstance;
}) =>
	linkedCustomerProducts.filter((linkedProduct) => {
		if (linkedProduct.product.id !== productId) return false;
		return syncPlan.entity_id
			? linkedProduct.internal_entity_id === syncPlan.entity_id
			: !linkedProduct.internal_entity_id;
	});
