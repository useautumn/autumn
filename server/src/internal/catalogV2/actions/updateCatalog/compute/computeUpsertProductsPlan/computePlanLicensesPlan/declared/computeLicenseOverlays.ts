import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { PlanLicensePlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { computeEntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { hasCustomizeFields } from "../licensePlanUtils";

/**
 * Customize → entitlement/price rows vs the child's own rows.
 * `same` keeps stock ids; `new` is the is_custom overlay.
 */
export const computeLicenseOverlays = ({
	ctx,
	planLicenses,
}: {
	ctx: AutumnContext;
	planLicenses: PlanLicensePlan[];
}): PlanLicensePlan[] =>
	planLicenses.map((planLicense) => {
		if (
			!hasCustomizeFields(planLicense.customize) ||
			!planLicense.licenseProduct
		)
			return planLicense;

		const entitlementPricesPlan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "custom" },
				product: planLicense.licenseProduct,
				customize: planLicense.customize,
				currentRows: {
					prices: planLicense.licenseProduct.prices,
					entitlements: planLicense.licenseProduct.entitlements,
				},
			},
		});

		return {
			...planLicense,
			entitlementPricesPlan,
			effectiveLicenseProduct: {
				...planLicense.licenseProduct,
				prices: entitlementPricesPlan.projected.prices,
				entitlements: getEntsWithFeature({
					ents: entitlementPricesPlan.projected.entitlements,
					features: ctx.features,
				}),
			},
		};
	});
