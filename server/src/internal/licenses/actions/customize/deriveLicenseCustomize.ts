import {
	type ApiPlanV1,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type FullProduct,
	productV2ToApiPlanV1,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import {
	type LicenseItemRows,
	licenseItemRepo,
} from "../../repos/licenseItemRepo.js";
import { effectiveProductFromItems } from "./resolveEffectiveLicenseProduct.js";

const productToApiPlan = ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}): ApiPlanV1 =>
	productV2ToApiPlanV1({
		product: mapToProductV2({ product, features: ctx.features }),
		features: ctx.features,
		currency: ctx.org.default_currency ?? "USD",
	});

/** Derived `customize` diff over already-loaded item rows: null when stock. */
export const deriveCustomizeFromItems = ({
	ctx,
	licenseProduct,
	itemRows,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	itemRows: LicenseItemRows;
}): DiffedCustomizePlanV1 | null => {
	const effective = effectiveProductFromItems({
		ctx,
		licenseProduct,
		itemRows,
	});
	if (effective === licenseProduct) return null;

	const diff = diffPlanV1({
		from: productToApiPlan({ ctx, product: licenseProduct }),
		to: productToApiPlan({ ctx, product: effective }),
	});
	return Object.keys(diff).length === 0 ? null : diff;
};

/** Derived `customize` diff for API responses: null when stock. */
export const deriveLicenseCustomize = async ({
	ctx,
	licenseProduct,
	planLicenseId,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	planLicenseId: string;
}): Promise<DiffedCustomizePlanV1 | null> => {
	const itemRows = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: [planLicenseId],
	});
	return deriveCustomizeFromItems({ ctx, licenseProduct, itemRows });
};
