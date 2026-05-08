import type { FullCustomer, Migration } from "@autumn/shared";
import type { MigrationStripeCache } from "@/internal/migrations/v2/stripeCache/index.js";

export type MigrateCustomerContext = {
	migration: Migration;
	fullCustomer: FullCustomer;
	stripeCache: MigrationStripeCache;
};
