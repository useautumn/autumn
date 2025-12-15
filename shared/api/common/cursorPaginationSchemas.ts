import { z } from "zod/v4";

export const PaginationDefaults = {
	Limit: 50,
	MaxLimit: 100,
};

export const CursorPaginationQuerySchema = z.object({
	starting_after: z
		.string()
		.optional()
		.describe("Cursor for pagination. Use next_cursor from previous response."),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(PaginationDefaults.MaxLimit)
		.default(PaginationDefaults.Limit)
		.describe(
			`Number of items to return. Default ${PaginationDefaults.Limit}, max ${PaginationDefaults.MaxLimit}.`,
		),
});

export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

export const createCursorPaginatedResponseSchema = <T extends z.ZodType>(
	itemSchema: T,
) =>
	z.object({
		list: z.array(itemSchema).describe("Array of items for current page"),
		has_more: z
			.boolean()
			.describe("Whether more results exist after this page"),
		next_cursor: z
			.string()
			.nullable()
			.describe("Opaque cursor for next page. Null if no more results."),
	});

export type CursorPaginatedResponse<T> = {
	data: T[];
	has_more: boolean;
	next_cursor: string | null;
};
