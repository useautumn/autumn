import {
	type ApiPlanV1,
	type CreatePlanItemParamsV1,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type Entitlement,
	type FullProduct,
	type Price,
	type ProductV2,
	productV2ToApiPlanV1,
	toCreatePlanItemParams,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct.js";
import { insertCustomItems } from "@/internal/customers/attach/attachUtils/insertCustomItems.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import type { LicenseItemRows } from "../../repos/licenseItemRepo.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";

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
