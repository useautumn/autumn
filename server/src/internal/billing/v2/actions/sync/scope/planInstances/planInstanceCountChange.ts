import type { FullCusProduct, SyncPlanInstance } from "@autumn/shared";
import { linkedPlanInstances } from "./linkedPlanInstances";

type PlanInstanceCountChange = {
	/** The missing instances to attach, leaving existing ones in place. */
	attach: SyncPlanInstance | null;
	/** Surplus instances to expire. */
	expire: FullCusProduct[];
};

/**
 * The same plan at a different Stripe quantity: how many instances to add or
 * expire so Autumn holds one row per unit. Null when the count already matches.
 */
export const planInstanceCountChange = ({
	linkedCustomerProducts,
	linkedProduct,
	syncPlan,
}: {
	linkedCustomerProducts: FullCusProduct[];
	linkedProduct: FullCusProduct;
	syncPlan: SyncPlanInstance;
}): PlanInstanceCountChange | null => {
	const instances = linkedPlanInstances({
		linkedCustomerProducts,
		productId: linkedProduct.product.id,
		syncPlan,
	});
	const desiredQuantity = syncPlan.quantity ?? 1;

	if (instances.length < desiredQuantity) {
		return {
			attach: {
				...syncPlan,
				quantity: desiredQuantity - instances.length,
				expire_previous: false,
			},
			expire: [],
		};
	}

	if (instances.length > desiredQuantity) {
		const surplusCount = instances.length - desiredQuantity;
		return {
			attach: null,
			expire: instances
				.filter((instance) => instance.id !== linkedProduct.id)
				.slice(0, surplusCount),
		};
	}

	return null;
};
