import {
	diffPlanV1,
	planDiffHasBillingChanges,
	PlanItemFilterPrecision,
	toBasePriceParams,
	type UpdateCatalogParams,
} from "@autumn/shared";
import { toMigratableCustomize } from "@/internal/catalogV2/actions/buildMigrationDraft/toMigratableCustomize";
import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange";
import {
	includeCustomForMigrationDraft,
	upsertClaimsMigrationDraft,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/matchingDraftPlanParams";
import { rowCanReceiveMigrationDraft } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/rowCanReceiveMigrationDraft";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** This row's own plan diff, or null when it did not ask / has nothing to migrate. */
export const resolveOwnMigrationTarget = ({
	upsertProductPlan,
	params,
	productStatesContext,
}: {
	upsertProductPlan: UpsertProductPlan;
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): MigrationTarget | null => {
	if (!upsertClaimsMigrationDraft({ upsertProductPlan, params })) return null;
	if (
		!rowCanReceiveMigrationDraft({ upsertProductPlan, productStatesContext })
	) {
		return null;
	}

	const { currentFullProduct, nextFullProduct, planId, version } =
		upsertProductPlan.row;
	if (!currentFullProduct) return null;

	const fromPlan = fullProductToApiPlanV1Sync({ product: currentFullProduct });
	const toPlan = fullProductToApiPlanV1Sync({ product: nextFullProduct });

	const customize = toMigratableCustomize({
		customize: diffPlanV1({
			from: fromPlan,
			to: toPlan,
			filterPrecision: PlanItemFilterPrecision.IdentityAndIncluded,
		}),
	});
	if (Object.keys(customize).length === 0) return null;

	return {
		planId,
		version,
		customize,
		previousPrice: fromPlan.price ? toBasePriceParams(fromPlan.price) : null,
		hasBillingChanges: planDiffHasBillingChanges(customize, fromPlan),
		includeCustom: includeCustomForMigrationDraft({
			upsertProductPlan,
			params,
		}),
	};
};
