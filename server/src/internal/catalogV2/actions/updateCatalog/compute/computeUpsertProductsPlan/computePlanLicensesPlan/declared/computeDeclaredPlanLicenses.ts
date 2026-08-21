import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { upsertProductPlanToLicenses } from "../licensePlanUtils";
import { computeLicenseOverlays } from "./computeLicenseOverlays";
import { resolveDeclaredPlanLicenses } from "./resolveDeclaredPlanLicenses";

/** licenses[] → full-set replace of this parent's links, with customize overlays. */
export const computeDeclaredPlanLicenses = ({
	ctx,
	upsert,
	productStatesContext,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): PlanLicensePlan[] => {
	if (upsert.declaredLicenses === undefined) return [];

	return computeLicenseOverlays({
		ctx,
		planLicenses: resolveDeclaredPlanLicenses({
			declared: upsert.declaredLicenses,
			currentLicenses: upsertProductPlanToLicenses({ upsert }),
			productStatesContext,
		}),
	});
};
