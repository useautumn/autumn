import type { FullProduct } from "@autumn/shared";
import type { UpsertProductOp } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";

export const resolveUpsertOp = ({
	currentFullProduct,
	detailsChanged,
	entitlementPricesPlan,
	freeTrialChanged,
}: {
	currentFullProduct: FullProduct | null;
	detailsChanged: boolean;
	entitlementPricesPlan?: EntitlementPricesPlan;
	freeTrialChanged: boolean;
}): UpsertProductOp => {
	if (!currentFullProduct) return "create";
	if (detailsChanged || entitlementPricesPlan || freeTrialChanged)
		return "update";
	return "none";
};
