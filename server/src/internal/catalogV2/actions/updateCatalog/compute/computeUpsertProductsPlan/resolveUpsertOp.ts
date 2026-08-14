import type { FullProduct } from "@autumn/shared";
import type { UpsertProductOp } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";

export const resolveUpsertOp = ({
	currentFullProduct,
	detailsChanged,
	entitlementPricesPlan,
	freeTrialChanged,
	planLicensesChanged = false,
}: {
	currentFullProduct: FullProduct | null;
	detailsChanged: boolean;
	entitlementPricesPlan?: EntitlementPricesPlan;
	freeTrialChanged: boolean;
	planLicensesChanged?: boolean;
}): UpsertProductOp => {
	if (!currentFullProduct) return "create";
	if (
		detailsChanged ||
		entitlementPricesPlan ||
		freeTrialChanged ||
		planLicensesChanged
	)
		return "update";
	return "none";
};
