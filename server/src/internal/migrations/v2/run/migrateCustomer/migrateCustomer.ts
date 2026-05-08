import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evaluateMigrateCustomerStripe } from "./evaluateMigrateCustomerStripe.js";
import { executeMigrateCustomerPlan } from "./executeMigrateCustomerPlan.js";
import {
	createMigrateCustomerRunContext,
	logMigrateCustomerResult,
} from "./logs/index.js";
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
	const migrationCtx = createMigrateCustomerRunContext({
		ctx,
		customerId,
		migration,
		preview,
	});

	try {
		const context = await setupMigrateCustomerContext({
			ctx: migrationCtx,
			migration,
			customerId,
		});

		const { plan: autumnPlan, billingContexts } = await processOperations({
			ctx: migrationCtx,
			context,
			plan: {
				customerId: context.fullCustomer.id ?? context.fullCustomer.internal_id,
				insertCustomerProducts: [],
			},
		});

		const billingPlan = await evaluateMigrateCustomerStripe({
			ctx: migrationCtx,
			context,
			billingContexts,
			autumnBillingPlan: autumnPlan,
		});

		if (!preview) {
			await executeMigrateCustomerPlan({
				ctx: migrationCtx,
				context,
				billingPlan,
			});
		}

		logMigrateCustomerResult({
			ctx: migrationCtx,
			result: {
				status: "success",
			},
		});

		return;
	} catch (error) {
		logMigrateCustomerResult({
			ctx: migrationCtx,
			result: {
				status: "error",
				error,
			},
		});
		throw error;
	}
};
