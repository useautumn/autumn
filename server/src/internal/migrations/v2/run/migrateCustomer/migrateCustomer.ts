import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evaluateMigrateCustomerStripe } from "./evaluateMigrateCustomerStripe.js";
import { executeMigrateCustomerPlan } from "./executeMigrateCustomerPlan.js";
import { processOperations } from "./processOperations.js";
import { setupMigrateCustomerContext } from "./setup/setupMigrateCustomerContext.js";

/**
 * Top-level per-customer migration runner.
 *
 *   1. Customer-level setup once (FullCustomer + migration facts).
 *   2. Fold ordered operations onto one AutumnBillingPlan.
 *   3. Evaluate/execute the plan.
 *
 * `preview: true` short-circuits after evaluate — no DB or Stripe writes.
 */
export const migrateCustomer = async ({
	ctx,
	customerId,
	migration,
	preview = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	migration: Migration;
	preview?: boolean;
}) => {
	const context = await setupMigrateCustomerContext({
		ctx,
		migration,
		customerId,
	});

	const { plan: autumnPlan, billingContexts } = await processOperations({
		ctx,
		context,
		plan: {
			customerId: context.fullCustomer.internal_id,
			insertCustomerProducts: [],
		},
	});

	const billingPlan = await evaluateMigrateCustomerStripe({
		ctx,
		context,
		billingContexts,
		autumnBillingPlan: autumnPlan,
	});

	const mode =
		Object.keys(billingPlan.stripe).length === 0 ? "no_changes" : "stripe";

	if (!preview) {
		await executeMigrateCustomerPlan({
			ctx,
			context,
			billingPlan,
			mode,
		});
	}
};
