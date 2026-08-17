import type { CatalogMigration, UpdateCatalogParams } from "@autumn/shared";
import { buildMigrationDraft } from "@/internal/catalogV2/actions/buildMigrationDraft/buildMigrationDraft";
import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types";
import { ownWithoutLicenseLane } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/ownWithoutLicenseLane";
import { resolveLicenseMigrationTarget } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveLicenseMigrationTarget/resolveLicenseMigrationTarget";
import { resolveOwnMigrationTarget } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveOwnMigrationTarget";
import { versionsWithCustomersByPlanId } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/versionsWithCustomersByPlanId";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemovePlanPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * One draft covering this row's own plan diff plus its license-link diffs.
 * Empty diffs / mints never become targets.
 */
export const computeMigrationDraftPlans = ({
	upsertProductPlans,
	params,
	productStatesContext,
	removePlans = [],
}: {
	upsertProductPlans: UpsertProductPlan[];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	removePlans?: RemovePlanPlan[];
}): CatalogMigration[] => {
	const removedKeys = new Set(
		removePlans.map((row) => `${row.planId}:${row.version}`),
	);
	const targets: MigrationTarget[] = [];

	for (const upsertProductPlan of upsertProductPlans) {
		if (
			removedKeys.has(
				`${upsertProductPlan.row.planId}:${upsertProductPlan.row.version}`,
			)
		) {
			continue;
		}
		const own = resolveOwnMigrationTarget({
			upsertProductPlan,
			params,
			productStatesContext,
		});
		const license = resolveLicenseMigrationTarget({
			upsertProductPlan,
			upsertProductPlans,
			params,
			productStatesContext,
		});

		const ownTarget = ownWithoutLicenseLane({ own, license });
		if (ownTarget) targets.push(ownTarget);
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
