import type { FullCustomer } from "@autumn/shared";
import type { MigrationStripeCache } from "@/internal/migrations/v2/stripeCache/index.js";
import type { MigrationRuntime } from "../../types/migrationDefinition.js";

export type MigrateCustomerContext = {
	migration: MigrationRuntime;
	fullCustomer: FullCustomer;
	stripeCache: MigrationStripeCache;
	/** Preview/dry-run — seeds placeholder Stripe ids instead of calling Stripe for real. */
	preview: boolean;
};
