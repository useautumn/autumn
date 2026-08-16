import type {
	UpdateCatalogParams,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

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

/** The params entry whose `migration.draft` claims this upsert row. */
export const matchingDraftPlanParams = ({
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

export const upsertClaimsMigrationDraft = ({
	upsertProductPlan,
	params,
}: {
	upsertProductPlan: UpsertProductPlan;
	params: UpdateCatalogParams;
}): boolean => matchingDraftPlanParams({ upsertProductPlan, params }) != null;

export const includeCustomForMigrationDraft = ({
	upsertProductPlan,
	params,
}: {
	upsertProductPlan: UpsertProductPlan;
	params: UpdateCatalogParams;
}): boolean =>
	matchingDraftPlanParams({ upsertProductPlan, params })?.migration
		?.include_custom === true;
