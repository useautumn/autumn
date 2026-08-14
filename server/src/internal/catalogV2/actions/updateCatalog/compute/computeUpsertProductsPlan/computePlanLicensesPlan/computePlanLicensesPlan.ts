import type { LicenseCustomize, PlanLicenseParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePlanLicenseRowPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/computePlanLicenseRowPlan/computePlanLicenseRowPlan";
import { diffDeclaredPlanLicenses } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/diffDeclaredPlanLicenses";
import { resolveUpsertOp } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/resolveUpsertOp";
import type {
	LicenseStatesContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { computeEntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";

const currentLicensesForUpsert = ({ upsert }: { upsert: UpsertProductPlan }) =>
	upsert.row.currentFullProduct?.licenses ??
	upsert.row.baseFullProduct?.licenses ??
	[];

const hasCustomizeFields = (
	customize: LicenseCustomize | null | undefined,
): customize is LicenseCustomize =>
	customize != null &&
	(customize.price !== undefined ||
		customize.add_items !== undefined ||
		customize.remove_items !== undefined);

/**
 * planLicenses facet for one parent row: declared licenses[] vs current links.
 */
export const computePlanLicensesPlan = ({
	ctx,
	upsert,
	declared,
	productStatesContext,
	licenseStatesContext,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
	declared: PlanLicenseParams[];
	productStatesContext: ProductStatesContext;
	licenseStatesContext: LicenseStatesContext;
}): UpsertProductPlan => {
	// Diff the declared set against current links → per-link write ops.
	const diffedPlanLicenses = diffDeclaredPlanLicenses({
		declared,
		currentLicenses: currentLicensesForUpsert({ upsert }),
		productStatesContext,
	});

	// Resolve each declared customize into a custom-mode content plan vs the
	// child's own rows: `same` keeps stock ids, `new` is the is_custom overlay.
	const planLicensesWithOverlays = diffedPlanLicenses.map((planLicense) => {
		if (!hasCustomizeFields(planLicense.customize) || !planLicense.licenseProduct)
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

	// Decide each link's exact row/junction writes so execute stays pure.
	const planLicenses = planLicensesWithOverlays.map((planLicense) => ({
		...planLicense,
		rowPlan: computePlanLicenseRowPlan({
			planLicense,
			parentInternalProductId: upsert.row.nextFullProduct.internal_id,
			referencedPlanLicenseIds:
				licenseStatesContext.referencedPlanLicenseIds,
		}),
	}));

	const planLicensesChanged = planLicenses.some(
		(planLicense) => planLicense.op !== "none",
	);

	return {
		...upsert,
		planLicenses,
		row: {
			...upsert.row,
			op: resolveUpsertOp({
				currentFullProduct: upsert.row.currentFullProduct,
				detailsChanged: upsert.details !== undefined,
				entitlementPricesPlan: upsert.entitlementPricesPlan,
				freeTrialChanged: upsert.freeTrialPlan !== undefined,
				planLicensesChanged,
			}),
		},
	};
};
