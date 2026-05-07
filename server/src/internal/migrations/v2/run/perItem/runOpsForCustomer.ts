import type { Operations } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";
import { type ApplyAddItemResult, applyAddItem } from "./applyAddItem.js";
import { matchCustomerProductsByTarget } from "./matchPlanFilter.js";

export type RunOpsForCustomerResult = {
	internal_customer_id: string;
	matched_cusproducts: number;
	add_items: ApplyAddItemResult[];
};

/**
 * Walk a customer's matching cusproducts × the migration's update_plans
 * × add_items. Phase 1 only — delete_items + priced add_items will be
 * routed in here as their handlers ship.
 */
export const runOpsForCustomer = async ({
	ctx,
	scope_id,
	internal_customer_id,
	operations,
	prepared_state,
	dry_run,
}: {
	ctx: AutumnContext;
	scope_id: string;
	internal_customer_id: string;
	operations: Operations;
	prepared_state: PreparedState;
	dry_run: boolean;
}): Promise<RunOpsForCustomerResult> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: internal_customer_id,
	});

	const updatePlans = operations.customer?.update_plans ?? [];
	let matched = 0;
	const addItemResults: ApplyAddItemResult[] = [];

	for (const op of updatePlans) {
		const cps = matchCustomerProductsByTarget({
			cusProducts: fullCustomer.customer_products,
			target: op.target,
		});
		matched += cps.length;

		for (const cusProduct of cps) {
			for (const addItem of op.add_items ?? []) {
				const result = await applyAddItem({
					ctx,
					scope_id,
					cusProduct,
					addItem,
					prepared_state,
					dry_run,
				});
				addItemResults.push(result);
			}
		}
	}

	return {
		internal_customer_id,
		matched_cusproducts: matched,
		add_items: addItemResults,
	};
};
