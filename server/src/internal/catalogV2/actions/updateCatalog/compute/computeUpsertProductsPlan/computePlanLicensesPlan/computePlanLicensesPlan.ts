import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveUpsertOp } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/resolveUpsertOp";
import type {
	LicenseStatesContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { computeDeclaredPlanLicenses } from "./declared/computeDeclaredPlanLicenses";
import { computeFinalDeclaredLicenses } from "./declared/computeFinalDeclaredLicenses";
import { computePinnedPlanLicenses } from "./pinned/computePinnedPlanLicenses";
import { planLicensesPlanToFullPlanLicenses } from "./planLicensesPlanToFullPlanLicenses";
import { computePropagatedPlanLicenses } from "./propagated/computePropagatedPlanLicenses";
import { computePlanLicenseRowPlan } from "./row/computePlanLicenseRowPlan";

const withPlanLicenseRowPlans = ({
	upsert,
	planLicenses,
	licenseStatesContext,
}: {
	upsert: UpsertProductPlan;
	planLicenses: PlanLicensePlan[];
	licenseStatesContext: LicenseStatesContext;
}): UpsertProductPlan => {
	const planned = planLicenses.map((planLicense) => ({
		...planLicense,
		rowPlan: computePlanLicenseRowPlan({
			planLicense,
			parentInternalProductId: upsert.row.nextFullProduct.internal_id,
			referencedPlanLicenseIds: licenseStatesContext.referencedPlanLicenseIds,
		}),
	}));

	const planLicensesChanged = planned.some(
		(planLicense) => planLicense.op !== "none",
	);

	return {
		...upsert,
		planLicenses: planned,
		row: {
			...upsert.row,
			op: resolveUpsertOp({
				currentFullProduct: upsert.row.currentFullProduct,
				detailsChanged: upsert.details !== undefined,
				entitlementPricesPlan: upsert.entitlementPricesPlan,
				freeTrialChanged: upsert.freeTrialPlan !== undefined,
				planLicensesChanged,
			}),
			nextFullProduct: {
				...upsert.row.nextFullProduct,
				licenses: planLicensesPlanToFullPlanLicenses({
					planLicenses: planned,
					parentInternalProductId: upsert.row.nextFullProduct.internal_id,
				}),
			},
		},
	};
};

/**
 * planLicenses for every plan in the batch. Runs after all plan content is
 * folded. Declared licenses[] is exclusive; otherwise pin and adopt concat.
 */
export const computePlanLicensesPlan = ({
	ctx,
	upsertProducts,
	productStatesContext,
	licenseStatesContext,
}: {
	ctx: AutumnContext;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	licenseStatesContext: LicenseStatesContext;
}): UpsertProductPlan[] =>
	upsertProducts.map((upsert) => {
		const declaredLicenses = computeFinalDeclaredLicenses({ upsert });
		if (declaredLicenses !== undefined) {
			// Stamp onto the returned plan so migration drafts take the
			// declaredLicenseDraftUpserts path (current→effective product
			// delta) instead of own-lane license snapshots that remint overlays.
			const withDeclared = { ...upsert, declaredLicenses };
			return withPlanLicenseRowPlans({
				upsert: withDeclared,
				planLicenses: computeDeclaredPlanLicenses({
					ctx,
					upsert: withDeclared,
					productStatesContext,
				}),
				licenseStatesContext,
			});
		}

		const planLicenses = [
			...computePinnedPlanLicenses({
				ctx,
				parent: upsert,
				upsertProducts,
			}),
			...computePropagatedPlanLicenses({
				ctx,
				parent: upsert,
				upsertProducts,
			}),
		];
		if (planLicenses.length === 0) return upsert;

		return withPlanLicenseRowPlans({
			upsert,
			planLicenses,
			licenseStatesContext,
		});
	});
