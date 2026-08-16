import { productToProductKey } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

/** This `(plan_id, version)` can appear in a draft `plan_filter`. */
export const rowCanReceiveMigrationDraft = ({
	upsertProductPlan,
	productStatesContext,
}: {
	upsertProductPlan: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): boolean => {
	if (upsertProductPlan.row.versioning === "new_version") return false;
	if (!upsertProductPlan.row.currentFullProduct) return false;

	const { customerUsage } = productKeyToState({
		productKey: productToProductKey({
			product: upsertProductPlan.row.currentFullProduct,
		}),
		productStatesContext,
	});
	return customerUsage.hasVersionableDirectCustomerProducts;
};
