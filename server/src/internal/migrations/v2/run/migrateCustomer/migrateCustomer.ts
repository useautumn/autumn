import type { BillingPlan, Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";
import { evaluateMigrateCustomerStripe } from "./evaluateMigrateCustomerStripe.js";
import {
	executeMigrateCustomerPlan,
	type MigrateCustomerExecuteMode,
} from "./executeMigrateCustomerPlan.js";
import { processOperations } from "./processOperations.js";
import { setupBucketBillingContext } from "./setup/setupBucketBillingContext.js";
import { setupCustomerLevel } from "./setup/setupCustomerLevel.js";

export type MigrateCustomerParams = {
	customer_id: string;
	migration: Migration;
	scope_id: string;
	prepared_state: PreparedState;
	preview?: boolean;
};

export type MigrateCustomerBucketResult = {
	stripe_subscription_id: string | null;
	billing_plan: BillingPlan;
	matched_cusproducts: number;
	applied: boolean;
	mode: MigrateCustomerExecuteMode;
};

export type MigrateCustomerResult = {
	customer_id: string;
	internal_customer_id: string;
	buckets: MigrateCustomerBucketResult[];
};

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
	params,
}: {
	ctx: AutumnContext;
	params: MigrateCustomerParams;
}): Promise<MigrateCustomerResult> => {
	const customerLevel = await setupCustomerLevel({
		ctx,
		migration: params.migration,
		scope_id: params.scope_id,
		prepared_state: params.prepared_state,
		customer_id: params.customer_id,
	});

	const bucketResults: MigrateCustomerBucketResult[] = [];

	for (const bucket of customerLevel.buckets) {
		const billingContext = await setupBucketBillingContext({
			ctx,
			customerLevel,
			bucket,
		});

		const { plan: autumnPlan } = await processOperations({
			ctx,
			billingContext,
			bucket,
			plan: {
				customerId: customerLevel.fullCustomer.internal_id,
				insertCustomerProducts: [],
			},
		});

		const billingPlan = await evaluateMigrateCustomerStripe({
			ctx,
			billingContext,
			autumnBillingPlan: autumnPlan,
		});

		const mode: MigrateCustomerExecuteMode =
			Object.keys(billingPlan.stripe).length === 0 ? "no_changes" : "stripe";

		if (params.preview) {
			bucketResults.push({
				stripe_subscription_id: bucket.stripe_subscription_id,
				billing_plan: billingPlan,
				matched_cusproducts: bucket.matches.length,
				applied: false,
				mode,
			});
			continue;
		}

		await executeMigrateCustomerPlan({
			ctx,
			billingContext,
			billingPlan,
			mode,
		});

		bucketResults.push({
			stripe_subscription_id: bucket.stripe_subscription_id,
			billing_plan: billingPlan,
			matched_cusproducts: bucket.matches.length,
			applied: true,
			mode,
		});
	}

	return {
		customer_id: params.customer_id,
		internal_customer_id: customerLevel.fullCustomer.internal_id,
		buckets: bucketResults,
	};
};
