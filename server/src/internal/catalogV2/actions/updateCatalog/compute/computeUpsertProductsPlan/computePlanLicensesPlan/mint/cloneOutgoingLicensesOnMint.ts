import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fullPlanLicenseToParams } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/toPlanLicenseParams";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { computeLicenseOverlays } from "../declared/computeLicenseOverlays";
import { resolveDeclaredPlanLicenses } from "../declared/resolveDeclaredPlanLicenses";
import {
	projectedLicensePlanId,
	upsertProductPlanToLicenses,
} from "../licensePlanUtils";

/**
 * A minted row continues the source offering. Declared licenses[] already
 * ran exclusive; this clones leftover outgoing links from the clone source.
 */
export const cloneOutgoingLicensesOnMint = ({
	ctx,
	upsert,
	alreadyPlanned,
	productStatesContext,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
	alreadyPlanned: PlanLicensePlan[];
	productStatesContext: ProductStatesContext;
}): PlanLicensePlan[] => {
	if (upsert.row.versioning !== "new_version") return [];
	if (upsert.row.baseFullProduct == null) return [];

	const alreadyPlannedIds = new Set(
		alreadyPlanned.map((planLicense) => planLicense.licensePlanId),
	);
	const unplanned = upsertProductPlanToLicenses({ upsert })
		.map((link) => ({
			link,
			licensePlanId: projectedLicensePlanId({ link, productStatesContext }),
		}))
		.filter(({ licensePlanId }) => !alreadyPlannedIds.has(licensePlanId));
	if (unplanned.length === 0) return [];

	return computeLicenseOverlays({
		ctx,
		planLicenses: resolveDeclaredPlanLicenses({
			declared: unplanned.map(({ link, licensePlanId }) => ({
				...fullPlanLicenseToParams({ link }),
				license_plan_id: licensePlanId,
			})),
			currentLicenses: unplanned.map(({ link }) => link),
			productStatesContext,
		}),
	});
};
