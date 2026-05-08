import type { FullCustomer, Migration } from "@autumn/shared";

export type MigrateCustomerContext = {
	migration: Migration;
	fullCustomer: FullCustomer;
};
