import type { Migration, Operations } from "@autumn/shared";
import {
	type EnsurePricesAndEntitlementsInput,
	ensurePricesAndEntitlements,
} from "./modules/ensurePricesAndEntitlements/index.js";

/** One instance of a prep module to run. */
export type ImplicitPrepInstance = {
	key: string;
	module: typeof ensurePricesAndEntitlements;
	input: EnsurePricesAndEntitlementsInput;
};

/**
 * Pure walker. Takes an `operations` object directly so scripts (and
 * any other caller) can derive prep instances without a Migration row.
 * Module key format: `<kind>:<feature_id>:<plan_id>`.
 */
export const inferPrepareModules = ({
	operations,
}: {
	operations: Operations | null | undefined;
}): ImplicitPrepInstance[] => {
	const instances: ImplicitPrepInstance[] = [];
	const updatePlans = operations?.customer?.update_plans ?? [];

	for (const op of updatePlans) {
		const planId =
			typeof op.target.plan_id === "string" ? op.target.plan_id : undefined;
		if (!planId) continue;

		for (const item of op.add_items ?? []) {
			if (!item.feature_id) continue;
			// Phase 1 constraint: entitlement-only items. Priced items will be
			// handled by the same module in phase 2+.
			if (item.price) continue;

			instances.push({
				key: `ensure_prices_and_entitlements:${item.feature_id}:${planId}`,
				module: ensurePricesAndEntitlements,
				input: { target_plan_id: planId, feature_id: item.feature_id },
			});
		}
	}

	return instances;
};

/** Migration-fed shim. */
export const inferImplicitPrep = (
	migration: Migration,
): ImplicitPrepInstance[] =>
	inferPrepareModules({ operations: migration.operations });
