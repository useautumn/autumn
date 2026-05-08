import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer.js";
import type {
	MigrateCustomerContext,
	ProcessOperationResult,
} from "@/internal/migrations/v2/operations/types/index.js";
import { processUpdatePlan } from "@/internal/migrations/v2/operations/updatePlan/index.js";

/**
 * Fold ordered customer operations onto one AutumnBillingPlan.
 *
 * Each op matches against the projected customer state produced by all
 * previous ops, so later operations can target customer products created or
 * patched earlier in the same migration.
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

	for (const op of context.migration.operations?.customer ?? []) {
		const result = await processUpdatePlan({
			ctx,
			context,
			op,
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
