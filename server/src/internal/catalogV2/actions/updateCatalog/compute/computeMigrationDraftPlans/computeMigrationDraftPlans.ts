import type { CatalogMigration, UpdateCatalogParams } from "@autumn/shared";
import { buildMigrationDraft } from "@/internal/catalogV2/actions/buildMigrationDraft/buildMigrationDraft";
import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types";
import { resolveLicenseMigrationTarget } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveLicenseMigrationTarget/resolveLicenseMigrationTarget";
import { resolveOwnMigrationTarget } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveOwnMigrationTarget";
import { versionsWithCustomersByPlanId } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/versionsWithCustomersByPlanId";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * One draft covering this row's own plan diff plus its license-link diffs.
 * Empty diffs / mints never become targets.
 */
export const computeMigrationDraftPlans = ({
	upsertProductPlans,
	params,
	productStatesContext,
}: {
	upsertProductPlans: UpsertProductPlan[];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): CatalogMigration[] => {
	const targets: MigrationTarget[] = [];

	for (const upsertProductPlan of upsertProductPlans) {
		const own = resolveOwnMigrationTarget({
			upsertProductPlan,
			params,
			productStatesContext,
		});
		if (own) targets.push(own);

		const license = resolveLicenseMigrationTarget({
			upsertProductPlan,
			upsertProductPlans,
			params,
			productStatesContext,
		});
		if (license) targets.push(license);
	}

	const draft = buildMigrationDraft({
		targets,
		versionsWithCustomersByPlanId: versionsWithCustomersByPlanId({
			productStatesContext,
		}),
	});
	return draft ? [draft] : [];
};
