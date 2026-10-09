import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { fullCustomerWithDerivedIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/fullCustomerWithDerivedIsCustom.js";
import type { BaseProductCache } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { createMigrationStripeCache } from "@/internal/migrations/v2/stripeCache/index.js";
import type { MigrationRuntime } from "../../../types/migrationDefinition.js";

/** A run's catalog versions don't change mid-run, so the run shares one cache. */
const baseProductsByMigration = new WeakMap<
	MigrationRuntime,
	BaseProductCache
>();

const baseProductsForMigration = ({
	migration,
}: {
	migration: MigrationRuntime;
}): BaseProductCache => {
	const cached = baseProductsByMigration.get(migration);
	if (cached) return cached;
	const baseProducts: BaseProductCache = new Map();
	baseProductsByMigration.set(migration, baseProducts);
	return baseProducts;
};

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
	// Ops branch on is_custom, so they read the derived flag; the billing-plan hook persists it.
	const fullCustomer = await fullCustomerWithDerivedIsCustom({
		ctx,
		fullCustomer: await setupFullCustomerContext({
			ctx,
			params: { customer_id: customerId },
		}),
		baseProducts: baseProductsForMigration({ migration }),
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
