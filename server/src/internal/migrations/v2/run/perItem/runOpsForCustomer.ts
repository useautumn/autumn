import type { FullCustomer, Operations } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";
import { type ApplyAddItemResult, applyAddItem } from "./applyAddItem.js";
import { matchCustomerProductsByTarget } from "./matchPlanFilter.js";

export type RunOpsForCustomerResult = {
	internal_customer_id: string;
	matched_cusproducts: number;
	upsert_items: ApplyAddItemResult[];
};

/**
 * Walk a customer's matching cusproducts × the migration's update_plans
 * × upsert_items. Phase 1 only — delete_items + priced upsert_items
 * will be routed in here as their handlers ship.
 */
export const runOpsForCustomer = async ({
	ctx,
	scopeId,
	fullCustomer,
	operations,
	preparedState,
	dryRun,
}: {
	ctx: AutumnContext;
	scopeId: string;
	fullCustomer: FullCustomer;
	operations: Operations;
	preparedState: PreparedState;
	dryRun: boolean;
}): Promise<RunOpsForCustomerResult> => {
	const updatePlans = operations.customer?.update_plans ?? [];
	let matched = 0;
	const upsertItemResults: ApplyAddItemResult[] = [];

	for (const op of updatePlans) {
		const cps = matchCustomerProductsByTarget({
			cusProducts: fullCustomer.customer_products,
			target: op.target,
		});
		matched += cps.length;

		for (const cusProduct of cps) {
			for (const addItem of op.upsert_items ?? []) {
				const result = await applyAddItem({
					ctx,
					scope_id: scopeId,
					cusProduct,
					addItem,
					prepared_state: preparedState,
					dry_run: dryRun,
				});
				upsertItemResults.push(result);
			}
		}
	}

	return {
		internal_customer_id: fullCustomer.internal_id,
		matched_cusproducts: matched,
		upsert_items: upsertItemResults,
	};
};
