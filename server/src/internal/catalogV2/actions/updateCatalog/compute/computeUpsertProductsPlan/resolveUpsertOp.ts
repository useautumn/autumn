import type { FullProduct } from "@autumn/shared";
import type { UpsertProductOp } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";

export const resolveUpsertOp = ({
	currentFullProduct,
	detailsChanged,
	entitlementPricesPlan,
}: {
	currentFullProduct: FullProduct | null;
	detailsChanged: boolean;
	entitlementPricesPlan?: EntitlementPricesPlan;
}): UpsertProductOp => {
	if (!currentFullProduct) return "create";
	if (detailsChanged || entitlementPricesPlan) return "update";
	return "none";
};
