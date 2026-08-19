import type { UpdateCatalogParams } from "@autumn/shared";
import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types";
import { declaredLicenseDraftUpserts } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveLicenseMigrationTarget/declaredLicenseDraftUpserts";
import { propagateLicenseDraftUpserts } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveLicenseMigrationTarget/propagateLicenseDraftUpserts";
import { rowCanReceiveMigrationDraft } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/rowCanReceiveMigrationDraft";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** This parent's link diffs, or null when nothing claimed this row. */
export const resolveLicenseMigrationTarget = ({
	upsertProductPlan,
	upsertProductPlans,
	params,
	productStatesContext,
}: {
	upsertProductPlan: UpsertProductPlan;
	upsertProductPlans: UpsertProductPlan[];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): MigrationTarget | null => {
	if (
		!rowCanReceiveMigrationDraft({
			upsertProductPlan,
			productStatesContext,
		})
	) {
		return null;
	}

	const { upserts, hasBillingChanges, includeCustom } =
		upsertProductPlan.declaredLicenses !== undefined
			? declaredLicenseDraftUpserts({
					parent: upsertProductPlan,
					upsertProductPlans,
					params,
				})
			: propagateLicenseDraftUpserts({
					parent: upsertProductPlan,
					upsertProductPlans,
					params,
				});

	if (upserts.length === 0) return null;

	return {
		planId: upsertProductPlan.row.planId,
		version: upsertProductPlan.row.version,
		customize: { upsert_licenses: upserts },
		previousPrice: null,
		hasBillingChanges,
		includeCustom,
	};
};
