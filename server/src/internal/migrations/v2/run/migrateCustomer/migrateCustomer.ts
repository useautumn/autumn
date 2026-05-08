import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { recordMigrationCustomerEvent } from "../events/index.js";
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
	migrationRunId,
	preview = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	migration: Migration;
	migrationRunId: string;
	preview?: boolean;
}) => {
	const migrationCtx = createMigrateCustomerRunContext({
		ctx,
		customerId,
		migration,
		preview,
	});
	let context: MigrateCustomerContext | undefined;

	try {
		context = await setupMigrateCustomerContext({
			ctx: migrationCtx,
			migration,
			customerId,
		});

		await recordMigrationCustomerEvent({
			ctx,
			migration,
			migrationRunId,
			dryRun: preview,
			eventType: "customer_started",
			internalCustomerId: context.fullCustomer.internal_id,
			customerId: context.fullCustomer.id,
			details: { beforeCustomer: context.fullCustomer },
		});

		const {
			plan: autumnPlan,
			billingContexts,
			matchedCustomerProducts,
		} = await processOperations({
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

		await recordMigrationCustomerEvent({
			ctx,
			migration,
			migrationRunId,
			dryRun: preview,
			eventType:
				matchedCustomerProducts === 0
					? "customer_skipped"
					: "customer_succeeded",
			internalCustomerId: context.fullCustomer.internal_id,
			customerId: context.fullCustomer.id,
			details: {
				matchedCustomerProducts,
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

		await recordMigrationCustomerEvent({
			ctx,
			migration,
			migrationRunId,
			dryRun: preview,
			eventType: "customer_failed",
			internalCustomerId: context?.fullCustomer.internal_id ?? customerId,
			customerId: context?.fullCustomer.id,
			details: {
				error: {
					message: error instanceof Error ? error.message : String(error),
				},
			},
		});

		throw error;
	}
};
