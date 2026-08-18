import type { PlanLicenseParams } from "@autumn/shared";
import {
	applyLicenseParamsPatch,
	fullPlanLicenseToParams,
} from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/toPlanLicenseParams";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { upsertProductPlanToLicenses } from "../licensePlanUtils";

/** licenses[] as-is, or current links + upsert/remove patch. */
export const computeFinalDeclaredLicenses = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): PlanLicenseParams[] | undefined => {
	if (upsert.declaredLicenses !== undefined) return upsert.declaredLicenses;
	if (
		upsert.upsertLicenses === undefined &&
		upsert.removeLicenses === undefined
	) {
		return undefined;
	}

	return applyLicenseParamsPatch({
		licenses: upsertProductPlanToLicenses({ upsert }).map((link) =>
			fullPlanLicenseToParams({ link }),
		),
		upsertLicenses: upsert.upsertLicenses ?? [],
		removeLicenses: upsert.removeLicenses ?? [],
	});
};
