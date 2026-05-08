import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { bucketOpsBySubscription } from "./bucketOpsBySubscription.js";
import type { SubscriptionBucket } from "./types.js";

export type SetupMigrateCustomerContextResult = MigrateCustomerContext & {
	buckets: SubscriptionBucket[];
};

/**
 * Customer-level setup. Runs ONCE per customer:
 *   1. Fetch FullCustomer (with subs + entities).
 *   2. Match every op's target -> group matches by Stripe sub id.
 *
 * Per-subscription billing setup is intentionally separate; this context
 * only captures the migration-level customer state.
 */
export const setupMigrateCustomerContext = async ({
	ctx,
	migration,
	customerId,
}: {
	ctx: AutumnContext;
	migration: Migration;
	customerId: string;
}): Promise<SetupMigrateCustomerContextResult> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});

	const buckets = bucketOpsBySubscription({
		cusProducts: fullCustomer.customer_products,
		operations: migration.operations?.customer ?? {},
	});

	return { migration, fullCustomer, buckets };
};
