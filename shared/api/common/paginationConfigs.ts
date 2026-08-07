import {
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	CUSTOMER_PRODUCTS_MAX_LIMIT,
} from "../customers/cusPlans/listCustomerProductsParams.js";
import { PaginationDefaults } from "./cursorPaginationSchemas.js";

export enum PaginationType {
	ListCustomers = "list_customers",
	ListEntities = "list_entities",
	SearchCustomers = "search_customers",
	FullCustomers = "full_customers",
	ListCustomerProducts = "list_customer_products",
	ListInvoices = "list_invoices",
}

export type PaginationConfig = {
	defaultLimit: number;
	maxLimit: number;
};

/**
 * V2_4 tightens the default page ceiling on the customer and entity list
 * endpoints. An explicit per-org override still wins, so ops keeps its
 * escape hatch for anyone who genuinely needs bigger pages.
 */
export const V2_4_MAX_PAGINATION_LIMIT = 200;

export const V2_4_CAPPED_PAGINATION_TYPES: PaginationType[] = [
	PaginationType.ListCustomers,
	PaginationType.ListEntities,
];

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
		defaultLimit: CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
		maxLimit: CUSTOMER_PRODUCTS_MAX_LIMIT,
	},
	[PaginationType.ListInvoices]: {
		defaultLimit: PaginationDefaults.DefaultLimit,
		maxLimit: PaginationDefaults.MaxLimit,
	},
};
