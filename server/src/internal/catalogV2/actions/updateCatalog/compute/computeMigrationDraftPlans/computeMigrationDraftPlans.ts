import {
	type CatalogMigration,
	productToProductKey,
	type UpdateCatalogParams,
} from "@autumn/shared";
import { buildMigrationDraft } from "@/internal/catalogV2/actions/buildMigrationDraft/buildMigrationDraft";
import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types";
import {
	includeCustomForMigrationDraft,
	isEligibleForMigrationDraft,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/isEligibleForMigrationDraft";
import { resolveMigrationTarget } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveMigrationTarget";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const versionsWithCustomersByPlanId = ({
	productStatesContext,
}: {
	productStatesContext: ProductStatesContext;
}): Record<string, number[]> => {
	const result: Record<string, number[]> = {};
	for (const [planId, versions] of Object.entries(
		productStatesContext.versionsByPlanId,
	)) {
		result[planId] = versions
			.filter(
				(product) =>
					productKeyToState({
						productKey: productToProductKey({ product }),
						productStatesContext,
					}).customerUsage.hasVersionableCustomerProducts,
			)
			.map((product) => product.version);
	}
	return result;
};

/**
 * One draft covering every requesting (planId, version) row that has
 * versionable customers. Empty diffs / mints never become targets.
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
		if (!isEligibleForMigrationDraft({ upsertProductPlan, params })) continue;

		const target = resolveMigrationTarget({
			upsertProductPlan,
			productStatesContext,
			includeCustom: includeCustomForMigrationDraft({
				upsertProductPlan,
				params,
			}),
		});
		if (target) targets.push(target);
	}

	const draft = buildMigrationDraft({
		targets,
		versionsWithCustomersByPlanId: versionsWithCustomersByPlanId({
			productStatesContext,
		}),
	});
	return draft ? [draft] : [];
};
