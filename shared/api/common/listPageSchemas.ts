import { z } from "zod/v4";
import {
	CursorRequestFieldSchema,
	createCursorLimitSchema,
	defineCursor,
} from "./cursorPaginationSchemas.js";

export const LIST_PAGE_DEFAULT_LIMIT = 50;
export const LIST_PAGE_MAX_LIMIT = 200;

export const ListPageRequestSchema = z.object({
	customer_id: z.string().optional().meta({
		description:
			"Only return rows for this customer. Omit to list across every customer.",
	}),
	entity_id: z.string().optional().meta({
		description: "Only return rows for this entity. Requires customer_id.",
	}),
	limit: createCursorLimitSchema({
		defaultLimit: LIST_PAGE_DEFAULT_LIMIT,
		maxLimit: LIST_PAGE_MAX_LIMIT,
	}),
	start_cursor: CursorRequestFieldSchema,
});

export const requireCustomerForEntity = (params: {
	customer_id?: string;
	entity_id?: string;
}) => !params.entity_id || Boolean(params.customer_id);

export const entityRequiresCustomerMessage = {
	message: "entity_id requires customer_id",
	path: ["entity_id"],
};

export const createListPageResponseSchema = <T extends z.ZodType>(
	rowSchema: T,
) =>
	z.object({
		list: z.array(rowSchema).meta({ description: "Rows on this page." }),
		has_more: z.boolean().meta({
			description:
				"Whether more results exist. A page may hold fewer than `limit` items (even zero) while `has_more` is true, so paginate until `has_more` is false.",
		}),
		next_cursor: z.string().nullable().meta({
			description:
				"Pass as start_cursor to fetch the next page. Null when has_more is false.",
		}),
	});

export type ListPage<T> = {
	list: T[];
	has_more: boolean;
	next_cursor: string | null;
};

// `t`/`id` are null when a page stopped at its scan cap: resume after customer `c`.
const CustomerWalkCursorFieldsSchema = z.object({
	v: z.literal(0),
	c: z.string().min(1),
	t: z.number().int().nonnegative().nullable(),
	id: z.string().min(1).nullable(),
});

export type CustomerWalkCursorFields = z.infer<
	typeof CustomerWalkCursorFieldsSchema
>;

export const CustomerWalkCursor = defineCursor({
	fieldsSchema: CustomerWalkCursorFieldsSchema,
});
