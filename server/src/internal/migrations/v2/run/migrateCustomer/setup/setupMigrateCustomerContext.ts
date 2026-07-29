import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { createMigrationStripeCache } from "@/internal/migrations/v2/stripeCache/index.js";
import type { MigrationRuntime } from "../../../types/migrationDefinition.js";

/** Loads customer state and creates the lazy Stripe cache for migration ops. */
export const setupMigrateCustomerContext = async ({
	ctx,
	migration,
	customerId,
	preview,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
	customerId: string;
	preview: boolean;
}): Promise<MigrateCustomerContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});

	return {
		migration,
		fullCustomer,
		preview,
		stripeCache: createMigrationStripeCache({
			ctx,
			fullCustomer,
			allowStripeCustomerCreation: migration.no_billing_changes !== true,
		}),
	};
};
