import type { FullCusProduct, SyncPlanInstance } from "@autumn/shared";
import { linkedPlanInstances } from "./linkedPlanInstances";

/**
 * On a plan change the sync replaces one outgoing instance, carrying its
 * usage; every other instance of the outgoing plan has to expire.
 */
export const outgoingInstancesToExpire = ({
	linkedCustomerProducts,
	replacedProduct,
	syncPlan,
}: {
	linkedCustomerProducts: FullCusProduct[];
	replacedProduct: FullCusProduct;
	syncPlan: SyncPlanInstance;
}): FullCusProduct[] =>
	linkedPlanInstances({
		linkedCustomerProducts,
		productId: replacedProduct.product.id,
		syncPlan,
	}).filter((instance) => instance.id !== replacedProduct.id);
