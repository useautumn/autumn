import { PaginationDefaults } from "./cursorPaginationSchemas.js";

export enum PaginationType {
	ListCustomers = "list_customers",
	ListEntities = "list_entities",
	SearchCustomers = "search_customers",
	FullCustomers = "full_customers",
	ListCustomerProducts = "list_customer_products",
}

export type PaginationConfig = {
	defaultLimit: number;
	maxLimit: number;
};

export const PAGINATION_CONFIGS: Record<PaginationType, PaginationConfig> = {
	[PaginationType.ListCustomers]: {
		defaultLimit: PaginationDefaults.DefaultLimit,
		maxLimit: PaginationDefaults.MaxLimit,
	},
	[PaginationType.ListEntities]: {
		defaultLimit: PaginationDefaults.DefaultLimit,
		maxLimit: PaginationDefaults.SchemaHardCeiling,
	},
	[PaginationType.SearchCustomers]: {
		defaultLimit: PaginationDefaults.DefaultLimit,
		maxLimit: PaginationDefaults.MaxLimit,
	},
	[PaginationType.FullCustomers]: {
		defaultLimit: PaginationDefaults.DefaultLimit,
		maxLimit: PaginationDefaults.MaxLimit,
	},
	[PaginationType.ListCustomerProducts]: {
		defaultLimit: 10,
		maxLimit: 100,
	},
};
