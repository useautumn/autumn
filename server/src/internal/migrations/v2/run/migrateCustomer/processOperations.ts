import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	MigrateCustomerBillingContext,
	ProcessOperationResult,
} from "@/internal/migrations/v2/operations/types/index.js";
import { processUpsertItems } from "@/internal/migrations/v2/operations/upsertItems/index.js";
import type { SubscriptionBucket } from "./setup/types.js";

/**
 * Walk one subscription bucket's matches and fold each (op, cusProduct,
 * upsertItem) tuple onto the running plan + context. Phase 1 only walks
 * `update_plans` upsert_items; `delete_items` and future ops slot in
 * here as their processors land.
 */
export const processOperations = async ({
	ctx,
	billingContext,
	bucket,
	plan,
}: {
	ctx: AutumnContext;
	billingContext: MigrateCustomerBillingContext;
	bucket: SubscriptionBucket;
	plan: AutumnBillingPlan;
}): Promise<ProcessOperationResult> => {
	let state: ProcessOperationResult = { plan, billingContext };

	for (const { op, cusProduct } of bucket.matches) {
		for (const upsertItem of op.upsert_items ?? []) {
			state = await processUpsertItems({
				ctx,
				billingContext: state.billingContext,
				cusProduct,
				upsertItem,
				plan: state.plan,
			});
		}
		// TODO: delete_items processor
	}

	return state;
};
