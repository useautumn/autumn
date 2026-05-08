import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evaluateMigrateCustomerStripe } from "./evaluateMigrateCustomerStripe.js";
import { executeMigrateCustomerPlan } from "./executeMigrateCustomerPlan.js";
import { processOperations } from "./processOperations.js";
import { setupMigrateCustomerContext } from "./setup/setupMigrateCustomerContext.js";

/**
 * Top-level per-customer migration runner.
 *
 *   1. Customer-level setup once (FullCustomer + bucket ops by Stripe sub).
 *   2. For each bucket, run a familiar one-sub-per-action pipeline:
 *      setup → process → evaluate → execute.
 *   3. Aggregate per-bucket results.
 *
 * `preview: true` short-circuits each bucket after evaluate — no DB or
 * Stripe writes. Bucket plans are returned for inspection.
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
	const migrateCustomerContext = await setupMigrateCustomerContext({
		ctx,
		migration,
		customerId,
	});

	const bucketResults = [];

	for (const bucket of migrateCustomerContext.buckets) {
		const { plan: autumnPlan } = await processOperations({
			ctx,
			migrationContext: migrateCustomerContext,
			bucket,
			plan: {
				customerId: migrateCustomerContext.fullCustomer.internal_id,
				insertCustomerProducts: [],
			},
		});

		const billingPlan = await evaluateMigrateCustomerStripe({
			ctx,
			migrationContext: migrateCustomerContext,
			autumnBillingPlan: autumnPlan,
		});

		const mode =
			Object.keys(billingPlan.stripe).length === 0 ? "no_changes" : "stripe";

		if (preview) {
			bucketResults.push({
				stripe_subscription_id: bucket.stripeSubscriptionId,
				billing_plan: billingPlan,
				matched_cusproducts: bucket.matches.length,
				applied: false,
				mode,
			});
			continue;
		}

		await executeMigrateCustomerPlan({
			ctx,
			migrationContext: migrateCustomerContext,
			billingPlan,
			mode,
		});

		bucketResults.push({
			stripe_subscription_id: bucket.stripeSubscriptionId,
			billing_plan: billingPlan,
			matched_cusproducts: bucket.matches.length,
			applied: true,
			mode,
		});
	}

	return {
		customer_id: customerId,
		internal_customer_id: migrateCustomerContext.fullCustomer.internal_id,
		buckets: bucketResults,
	};
};
