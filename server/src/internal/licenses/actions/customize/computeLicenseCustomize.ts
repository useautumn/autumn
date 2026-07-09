import type {
	CreatePlanItemParamsV1,
	Entitlement,
	FullProduct,
	Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct.js";

export type LicenseCustomizeComputation = {
	effectiveProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
};

export const computeLicenseCustomize = async ({
	ctx,
	licenseProduct,
	items,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	items: CreatePlanItemParamsV1[];
}): Promise<LicenseCustomizeComputation> => {
	const custom = await setupCustomFullProduct({
		ctx,
		currentFullProduct: licenseProduct,
		customizePlan: { items },
	});
	return {
		effectiveProduct: custom.fullProduct,
		customPrices: custom.customPrices as Price[],
		customEntitlements: custom.customEnts as Entitlement[],
	};
};
