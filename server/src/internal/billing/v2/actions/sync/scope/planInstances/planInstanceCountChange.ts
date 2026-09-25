import type { FullCusProduct, SyncPlanInstance } from "@autumn/shared";
import type { MatchedPlan } from "../../detect/types";
import { planExpandsByQuantity } from "../../utils/planExpandsByQuantity";
import { linkedPlanInstances } from "./linkedPlanInstances";

/**
 * The same plan at a different Stripe quantity, as the plan to sync. Missing
 * instances attach alongside the existing ones; a smaller quantity re-syncs
 * the whole group so surplus rows expire with their usage carried. Null when
 * the count already matches.
 */
export const planInstanceCountChange = ({
	linkedCustomerProducts,
	linkedProduct,
	matchedPlan,
	syncPlan,
}: {
	linkedCustomerProducts: FullCusProduct[];
	linkedProduct: FullCusProduct;
	matchedPlan: MatchedPlan;
	syncPlan: SyncPlanInstance;
}): SyncPlanInstance | null => {
	const expands = planExpandsByQuantity({
		plan: syncPlan,
		isAddOn: matchedPlan.product.is_add_on === true,
	});
	const desiredInstances = expands ? (syncPlan.quantity ?? 1) : 1;
	const instances = linkedPlanInstances({
		linkedCustomerProducts,
		productId: linkedProduct.product.id,
		syncPlan,
	});

	if (instances.length < desiredInstances) {
		return {
			...syncPlan,
			quantity: desiredInstances - instances.length,
			expire_previous: false,
		};
	}
	if (instances.length > desiredInstances) return syncPlan;
	return null;
};
