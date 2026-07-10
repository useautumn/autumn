import {
	type ApiPlanV1,
	type DbPlanLicense,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type FullProduct,
	productV2ToApiPlanV1,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
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

/**
 * Batched `customize` derivation for a set of links: fetches each distinct
 * license product once (only for links that carry item rows) and returns the
 * diff per plan-license id. Uncustomized links map to null without a fetch.
 */
export const deriveCustomizeByLinkId = async ({
	ctx,
	links,
	itemRows,
}: {
	ctx: AutumnContext;
	links: { planLicense: DbPlanLicense }[];
	itemRows: LicenseItemRows;
}): Promise<Map<string, DiffedCustomizePlanV1 | null>> => {
	const customizedLinkIds = new Set([
		...itemRows.entitlements.map((row) => row.plan_license_id),
		...itemRows.prices.map((row) => row.plan_license_id),
	]);

	const licenseProducts = new Map<string, FullProduct>();
	for (const { planLicense } of links) {
		if (!customizedLinkIds.has(planLicense.id)) continue;
		const internalId = planLicense.license_internal_product_id;
		if (licenseProducts.has(internalId)) continue;
		licenseProducts.set(
			internalId,
			await getFullLicenseProduct({ ctx, idOrInternalId: internalId }),
		);
	}

	const customizeByLinkId = new Map<string, DiffedCustomizePlanV1 | null>();
	for (const { planLicense } of links) {
		const licenseProduct = licenseProducts.get(
			planLicense.license_internal_product_id,
		);
		customizeByLinkId.set(
			planLicense.id,
			licenseProduct
				? deriveCustomizeFromItems({
						ctx,
						licenseProduct,
						itemRows: {
							entitlements: itemRows.entitlements.filter(
								(row) => row.plan_license_id === planLicense.id,
							),
							prices: itemRows.prices.filter(
								(row) => row.plan_license_id === planLicense.id,
							),
						},
					})
				: null,
		);
	}
	return customizeByLinkId;
};
