import type { FullCustomer, Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";
import { bucketOpsBySubscription } from "./bucketOpsBySubscription.js";
import type { SubscriptionBucket } from "./types.js";

export type CustomerLevelContext = {
	migration: Migration;
	scope_id: string;
	prepared_state: PreparedState;
	fullCustomer: FullCustomer;
	buckets: SubscriptionBucket[];
};

/**
 * Customer-level setup. Runs ONCE per customer:
 *   1. Fetch FullCustomer (with subs + entities).
 *   2. Match every op's target → group matches by Stripe sub id.
 *
 * Per-bucket Stripe state is fetched later in `setupBucketBillingContext`
 * so unused subs aren't paid for.
 */
export const setupCustomerLevel = async ({
	ctx,
	migration,
	scope_id,
	prepared_state,
	customer_id,
}: {
	ctx: AutumnContext;
	migration: Migration;
	scope_id: string;
	prepared_state: PreparedState;
	customer_id: string;
}): Promise<CustomerLevelContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id },
	});

	const buckets = bucketOpsBySubscription({
		cusProducts: fullCustomer.customer_products,
		operations: migration.operations?.customer ?? {},
	});

	return { migration, scope_id, prepared_state, fullCustomer, buckets };
};
