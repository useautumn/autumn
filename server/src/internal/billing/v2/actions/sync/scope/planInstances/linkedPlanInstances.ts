import type { FullCusProduct, SyncPlanInstance } from "@autumn/shared";

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
