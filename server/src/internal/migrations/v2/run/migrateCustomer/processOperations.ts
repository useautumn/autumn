import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer.js";
import {
	executionPriority,
	getProcessor,
} from "@/internal/migrations/v2/operations/operationRegistry.js";
import type {
	MigrateCustomerContext,
	ProcessOperationResult,
} from "@/internal/migrations/v2/operations/types/index.js";

/**
 * Fold ordered customer operations onto one AutumnBillingPlan.
 *
 * Operations are sorted by execution order (add_plan → update_plan),
 * preserving original array order within the same type. Each op sees
 * the projected customer state from all previous ops.
 */
export const processOperations = async ({
	ctx,
	context,
	plan,
}: {
	ctx: AutumnContext;
	context: MigrateCustomerContext;
	plan: AutumnBillingPlan;
}): Promise<ProcessOperationResult> => {
	let state: ProcessOperationResult = {
		plan,
		projectedFullCustomer: context.fullCustomer,
		matchedCustomerProducts: 0,
		billingContexts: [],
	};

	const operations = context.migration.operations?.customer ?? [];
	const sorted = operations
		.map((op, originalIndex) => ({ op, originalIndex }))
		.sort((a, b) => executionPriority(a.op) - executionPriority(b.op));

	for (const { op, originalIndex } of sorted) {
		const processor = getProcessor(op);
		const result = await processor({
			ctx,
			context,
			op,
			opIndex: originalIndex,
			plan: state.plan,
			projectedFullCustomer: state.projectedFullCustomer,
		});

		state = {
			plan: result.plan,
			projectedFullCustomer: applyAutumnBillingPlanToFullCustomer({
				fullCustomer: context.fullCustomer,
				autumnBillingPlan: result.plan,
			}),
			matchedCustomerProducts:
				state.matchedCustomerProducts + result.matchedCustomerProducts,
			billingContexts: [...state.billingContexts, ...result.billingContexts],
		};
	}

	return state;
};
