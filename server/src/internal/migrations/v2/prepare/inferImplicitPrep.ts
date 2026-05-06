import type { Migration } from "@autumn/shared";
import {
	ensurePricesAndEntitlements,
	type EnsurePricesAndEntitlementsInput,
} from "./modules/ensurePricesAndEntitlements/index.js";

/**
 * One instance of a prep module to run. The orchestrator calls each
 * instance's `plan` / `apply` in order.
 */
export type ImplicitPrepInstance = {
	key: string;
	module: typeof ensurePricesAndEntitlements;
	input: EnsurePricesAndEntitlementsInput;
};

/**
 * Walk the migration's operations and derive which prep modules need to
 * run. Phase 1 only emits `ensure_prices_and_entitlements` from
 * `update_plans[].add_items[]`.
 *
 * Module key format: `<kind>:<feature_id>:<plan_id>` so distinct
 * (target, feature) pairs get distinct prep entries.
 */
export const inferImplicitPrep = (
	migration: Migration,
): ImplicitPrepInstance[] => {
	const instances: ImplicitPrepInstance[] = [];
	const updatePlans = migration.operations?.customer?.update_plans ?? [];

	for (const op of updatePlans) {
		const planId =
			typeof op.target.plan_id === "string" ? op.target.plan_id : undefined;
		if (!planId) continue;

		for (const item of op.add_items ?? []) {
			if (!item.feature_id) continue;
			// Phase 1 constraint: only entitlement-only items. Priced items
			// will be handled by the same module in phase 2+.
			if (item.price) continue;

			instances.push({
				key: `ensure_prices_and_entitlements:${item.feature_id}:${planId}`,
				module: ensurePricesAndEntitlements,
				input: {
					target_plan_id: planId,
					feature_id: item.feature_id,
				},
			});
		}
	}

	return instances;
};
