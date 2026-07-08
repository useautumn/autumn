import type { Entitlement, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import type { LicenseItemRows } from "../../repos/licenseItemRepo.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";

export const effectiveProductFromItems = ({
	ctx,
	licenseProduct,
	itemRows,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	itemRows: LicenseItemRows;
}): FullProduct => {
	if (itemRows.entitlements.length === 0 && itemRows.prices.length === 0) {
		return licenseProduct;
	}
	return {
		...licenseProduct,
		prices: itemRows.prices as unknown as FullProduct["prices"],
		entitlements: getEntsWithFeature({
			ents: itemRows.entitlements as Entitlement[],
			features: ctx.features,
		}),
	};
};

export const resolveEffectiveLicenseProduct = async ({
	ctx,
	licenseProduct,
	planLicenseId,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	planLicenseId: string;
}): Promise<FullProduct> => {
	const itemRows = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: [planLicenseId],
	});
	return effectiveProductFromItems({ ctx, licenseProduct, itemRows });
};
