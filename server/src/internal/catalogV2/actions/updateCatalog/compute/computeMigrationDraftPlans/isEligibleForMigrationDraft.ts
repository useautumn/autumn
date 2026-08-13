import type {
	UpdateCatalogParams,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const matchingDraftPlanParams = ({
	upsertProductPlan,
	params,
}: {
	upsertProductPlan: UpsertProductPlan;
	params: UpdateCatalogParams;
}): UpdateCatalogPlanParams | undefined =>
	params.plans.find(
		(planParams) =>
			planParams.migration?.draft &&
			upsertMatchesDraftEntry({ upsertProductPlan, planParams }),
	);

const upsertMatchesDraftEntry = ({
	upsertProductPlan,
	planParams,
}: {
	upsertProductPlan: UpsertProductPlan;
	planParams: UpdateCatalogPlanParams;
}): boolean => {
	if (upsertProductPlan.row.planId !== planParams.plan_id) return false;
	if (upsertProductPlan.row.versioning === "new_version") return false;

	if (planParams.versioning === "all_versions") return true;
	if (planParams.version !== undefined) {
		return upsertProductPlan.row.version === planParams.version;
	}
	return upsertProductPlan.row.source === "direct";
};

/** This `(planId, version)` row asked for a draft and has versionable customers. */
export const isEligibleForMigrationDraft = ({
	upsertProductPlan,
	params,
}: {
	upsertProductPlan: UpsertProductPlan;
	params: UpdateCatalogParams;
}): boolean =>
	matchingDraftPlanParams({ upsertProductPlan, params }) != null &&
	upsertProductPlan.state.hasCustomers;

export const includeCustomForMigrationDraft = ({
	upsertProductPlan,
	params,
}: {
	upsertProductPlan: UpsertProductPlan;
	params: UpdateCatalogParams;
}): boolean =>
	matchingDraftPlanParams({ upsertProductPlan, params })?.migration
		?.include_custom === true;
