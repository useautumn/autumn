import { z } from "zod/v4";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";
import type { CursorPaginatedResponse } from "../../common/cursorPaginationSchemas.js";
import {
	CursorRequestFieldSchema,
	createCursorLimitSchema,
	defineCursor,
} from "../../common/cursorPaginationSchemas.js";

export enum CustomerProductKind {
	Subscription = "subscription",
	OneOff = "one_off",
	AddOn = "add_on",
}

export const CUSTOMER_PRODUCTS_DEFAULT_LIMIT = 10;
export const CUSTOMER_PRODUCTS_MAX_LIMIT = 100;

export const ListCustomerProductsParamsSchema = z.object({
	start_cursor: CursorRequestFieldSchema,
	limit: createCursorLimitSchema({
		defaultLimit: CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
		maxLimit: CUSTOMER_PRODUCTS_MAX_LIMIT,
	}),
	show_expired: z.coerce.boolean().default(false),
	entity_id: z.string().optional(),
	kind: z.enum(CustomerProductKind).optional(),
});

export type ListCustomerProductsParams = z.infer<
	typeof ListCustomerProductsParamsSchema
>;

export type CustomerProductsPage = CursorPaginatedResponse<FullCusProduct> & {
	total_count: number;
};

const CustomerProductsCursorFieldsSchema = z.object({
	v: z.literal(0),
	eRank: z.number().int().nonnegative(),
	rank: z.number().int().nonnegative(),
	t: z.number().int().nonnegative(),
	id: z.string().min(1),
});

export type CustomerProductsCursorFields = z.infer<
	typeof CustomerProductsCursorFieldsSchema
>;

export const CustomerProductsCursor = defineCursor({
	fieldsSchema: CustomerProductsCursorFieldsSchema,
});
