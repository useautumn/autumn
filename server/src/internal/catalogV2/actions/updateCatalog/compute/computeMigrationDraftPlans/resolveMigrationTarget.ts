import {
	diffPlanV1,
	planDiffHasBillingChanges,
	productToProductKey,
	toBasePriceParams,
} from "@autumn/shared";
import { toMigratableCustomize } from "@/internal/catalogV2/actions/buildMigrationDraft/toMigratableCustomize";
import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

/** One upsert row → a draft target, or null when it shouldn't migrate. */
export const resolveMigrationTarget = ({
	upsertProductPlan,
	productStatesContext,
	includeCustom,
}: {
	upsertProductPlan: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	includeCustom: boolean;
}): MigrationTarget | null => {
	const { row } = upsertProductPlan;
	if (row.versioning === "new_version") return null;
	if (!row.currentFullProduct) return null;

	const { customerUsage } = productKeyToState({
		productKey: productToProductKey({ product: row.currentFullProduct }),
		productStatesContext,
	});
	if (!customerUsage.hasVersionableCustomerProducts) return null;

	// Each FullProduct already carries the feature objects for its item ids
	// (current = pre-rename join, next = post-rename projection).
	const fromPlan = fullProductToApiPlanV1Sync({
		product: row.currentFullProduct,
	});
	const toPlan = fullProductToApiPlanV1Sync({
		product: row.nextFullProduct,
	});
	const customize = toMigratableCustomize({
		customize: diffPlanV1({ from: fromPlan, to: toPlan }),
	});
	if (Object.keys(customize).length === 0) return null;

	return {
		planId: row.planId,
		version: row.version,
		customize,
		previousPrice: fromPlan.price ? toBasePriceParams(fromPlan.price) : null,
		hasBillingChanges: planDiffHasBillingChanges(customize, fromPlan),
		includeCustom,
	};
};
