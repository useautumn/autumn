import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { createMigrationStripeCache } from "@/internal/migrations/v2/stripeCache/index.js";

/**
 * Customer-level setup. Runs ONCE per customer:
 *   1. Fetch FullCustomer (with subs + entities).
 *   2. Create a lazy Stripe cache for operation-level setup.
 *   3. Return immutable migration/customer facts.
 */
export const setupMigrateCustomerContext = async ({
	ctx,
	migration,
	customerId,
}: {
	ctx: AutumnContext;
	migration: Migration;
	customerId: string;
}): Promise<MigrateCustomerContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});

	return {
		migration,
		fullCustomer,
		stripeCache: createMigrationStripeCache({ ctx, fullCustomer }),
	};
};
